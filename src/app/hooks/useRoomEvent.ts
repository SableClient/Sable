import type { IEvent, Room, CryptoBackend } from '$types/matrix-sdk';
import { MatrixEvent, MatrixEventEvent, RoomEvent } from '$types/matrix-sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import to from 'await-to-js';
import { useQuery } from '@tanstack/react-query';
import { useMatrixClient } from './useMatrixClient';

const useFetchEvent = (room: Room, eventId: string) => {
  const mx = useMatrixClient();

  const fetchEventCallback = useCallback(async () => {
    // Use fetchRoomEvent rather than getEventTimeline.
    //
    // getEventTimeline calls /context, which adds a new EventTimeline to the
    // room's UnfilteredTimelineSet.  The SDK then emits RoomEvent.TimelineRefresh,
    // which RoomTimeline.tsx catches and scrolls the visible window back to the
    // live end — causing an unwanted jump-to-bottom on every reply reload.
    //
    // fetchRoomEvent fetches the raw event without touching the timeline state,
    // so there is no side-effect on the visible scroll position.  The trade-off
    // is that the returned MatrixEvent is standalone (not tracked in SDK state),
    // so we handle edits and decryption manually below.
    const evt = await mx.fetchRoomEvent(room.roomId, eventId);
    const mEvent = new MatrixEvent(evt);

    if (evt.unsigned?.['m.relations']?.['m.replace']) {
      const replaceEvt = evt.unsigned['m.relations']['m.replace'] as IEvent;
      mEvent.makeReplaced(new MatrixEvent(replaceEvt));
    }

    if (mEvent.isEncrypted() && mx.getCrypto()) {
      await to(mEvent.attemptDecryption(mx.getCrypto() as CryptoBackend));
    }

    return mEvent;
  }, [mx, room.roomId, eventId]);

  return fetchEventCallback;
};

/**
 *
 * @param room
 * @param eventId
 * @returns `MatrixEvent`, `undefined` means loading, `null` means failure
 */
export const useRoomEvent = (
  room: Room,
  eventId: string,
  getLocally?: () => MatrixEvent | undefined
) => {
  const mx = useMatrixClient();

  // Shared re-render trigger used by both decryption listeners below.
  const [, forceUpdate] = useState(0);

  // `tick` lets useMemo re-run when the reply-target event arrives via sync.
  // The Room reference is stable (SDK mutates it in-place), so without this
  // the memo would never recompute even when room.findEventById(eventId) would
  // now return a result.
  const [tick, setTick] = useState(0);

  const event = useMemo(() => {
    // `tick` intentionally forces re-evaluation when new timeline events arrive.
    void tick;
    // `tick` is in the deps array below — useMemo reruns whenever a timeline
    // event for our eventId arrives (see RoomEvent.Timeline below).
    // Check the caller's local window first (e.g. the rendered timeline set),
    // then fall back to the SDK's full room state.  Events that are present in
    // room history but outside the currently visible window are found this way
    // without a network round-trip.
    const local = getLocally?.();
    return local ?? room.findEventById(eventId);
  }, [room, eventId, getLocally, tick]);

  // Re-evaluate the local lookup the moment the target event arrives in the
  // room's live timeline.  We only subscribe while the event is missing to
  // keep overhead to zero once it has been resolved.  Checking the event ID
  // in the handler avoids spurious setTick calls for unrelated messages.
  useEffect(() => {
    if (event !== undefined) return undefined;
    const onTimeline = (incoming: MatrixEvent) => {
      if (incoming.getId() === eventId) setTick((n) => n + 1);
    };
    room.on(RoomEvent.Timeline, onTimeline);
    return () => {
      room.off(RoomEvent.Timeline, onTimeline);
    };
  }, [room, event, eventId]);

  const fetchEvent = useFetchEvent(room, eventId);

  const { data, error } = useQuery({
    // Only hit the network when neither the visible window nor the SDK's room
    // state has the event.  Note: fetchRoomEvent does NOT add its result to SDK
    // state, so `event` stays undefined after a successful fetch and this flag
    // remains true on subsequent renders — but staleTime: Infinity prevents
    // any redundant re-fetches.
    enabled: event === undefined,
    queryKey: [room.roomId, eventId],
    queryFn: fetchEvent,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 3,
    // Progressive back-off: 1 s → 2 s → 4 s (capped at 30 s).
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 30_000),
  });

  // ── E2EE retry for standalone fetched events ──────────────────────────────
  // fetchRoomEvent returns a MatrixEvent that is NOT tracked in SDK state, so
  // the SDK's normal Megolm key-delivery pipeline never fires
  // MatrixEventEvent.Decrypted on it.  Instead, we piggyback on the Decrypted
  // events of SDK-tracked live-timeline events as a proxy signal for
  // "new Megolm session keys have arrived" and immediately retry
  // attemptDecryption on our standalone event.
  useEffect(() => {
    if (!data?.isEncrypted() || !data.isDecryptionFailure()) return undefined;
    const crypto = mx.getCrypto();
    if (!crypto) return undefined;

    const retryDecrypt = async () => {
      const [err] = await to(data.attemptDecryption(crypto as CryptoBackend));
      if (!err && !data.isDecryptionFailure()) forceUpdate((n) => n + 1);
    };

    // Use the last 50 live-timeline events that are still encrypted as
    // sentinels.  When any of them fires Decrypted it means new keys arrived.
    const sentinels = room
      .getLiveTimeline()
      .getEvents()
      .slice(-50)
      .filter((e) => e.isEncrypted());

    const onKeyArrived = () => {
      retryDecrypt();
    };
    sentinels.forEach((e) => e.on(MatrixEventEvent.Decrypted, onKeyArrived));
    return () => sentinels.forEach((e) => e.off(MatrixEventEvent.Decrypted, onKeyArrived));
  }, [data, room, mx]);

  // ── Decryption listener for SDK-tracked events ────────────────────────────
  // When an event IS in the SDK state (found locally via `event`), the SDK's
  // Megolm pipeline fires MatrixEventEvent.Decrypted on it automatically when
  // keys later arrive.  Subscribe so the component re-renders without any
  // manual retry.
  const resolvedEvent = event ?? data ?? undefined;
  useEffect(() => {
    if (!resolvedEvent?.isEncrypted()) return undefined;
    const onDecrypted = () => forceUpdate((n) => n + 1);
    resolvedEvent.on(MatrixEventEvent.Decrypted, onDecrypted);
    return () => {
      resolvedEvent.off(MatrixEventEvent.Decrypted, onDecrypted);
    };
  }, [resolvedEvent]);

  if (event) return event;
  if (data) return data;
  if (error) return null;

  return undefined;
};
