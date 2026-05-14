import { useCallback, useEffect, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { RoomEventHandlerMap, MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { CryptoBackend, MatrixRTCSession, MatrixRTCSessionManagerEvents, RoomEvent } from '$types/matrix-sdk';
import { mDirectAtom } from '$state/mDirectList';
import { incomingCallAtom, mutedCallRoomIdAtom, type IncomingCall } from '$state/callEmbed';
import RingtoneSound from '$public/sound/ringtone.webm';
import {
  parseIncomingRtcNotification,
  REFERENCE_REL_TYPE,
  RTC_NOTIFICATION_EVENT_TYPE,
} from '$features/call/rtcNotificationParser';
import { useMatrixClient } from './useMatrixClient';
import { createDebugLogger } from '../utils/debugLogger';

const debugLog = createDebugLogger('CallSignaling');

const MAX_NOTIFICATION_LIFETIME_MS = 120_000;
const DECRYPT_TIMEOUT_MS = 8_000;
const FALLBACK_INTERVAL_MS = 5_000;
const OUTGOING_RING_TIMEOUT_MS = 30_000;

type SessionDescription = Parameters<typeof MatrixRTCSession.sessionMembershipsForRoom>[1];

const getRoomMemberships = (room: Room, sessionDescription: SessionDescription) =>
  MatrixRTCSession.sessionMembershipsForRoom(room, sessionDescription);

const isIncomingCallActive = (
  mxUserId: string,
  room: Room,
  sessionDescription: SessionDescription
): boolean => {
  const memberships = getRoomMemberships(room, sessionDescription);
  const remoteMembers = memberships.filter(
    (m: { userId?: string; sender?: string }) => (m.userId || m.sender) !== mxUserId
  );
  const selfMember = memberships.some(
    (m: { userId?: string; sender?: string }) => (m.userId || m.sender) === mxUserId
  );

  return remoteMembers.length > 0 && !selfMember;
};

const isCallActive = (
  mxUserId: string,
  room: Room,
  sessionDescription: SessionDescription
): boolean => {
  const memberships = getRoomMemberships(room, sessionDescription);
  const remoteMembers = memberships.filter(
    (m: { userId?: string; sender?: string }) => (m.userId || m.sender) !== mxUserId
  );
  const selfMember = memberships.some(
    (m: { userId?: string; sender?: string }) => (m.userId || m.sender) === mxUserId
  );

  return selfMember && remoteMembers.length > 0;
};

const decryptWithTimeout = async (
  event: MatrixEvent,
  mx: MatrixClient
): Promise<{ type?: string; content?: unknown } | undefined> => {
  const crypto = mx.getCrypto();
  if (!crypto) return undefined;

  try {
    if (!event.isBeingDecrypted()) {
      await event.attemptDecryption(crypto as CryptoBackend);
    }

    const decryptionPromise = event.getDecryptionPromise();
    if (decryptionPromise) {
      await Promise.race([
        decryptionPromise,
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, DECRYPT_TIMEOUT_MS);
        }),
      ]);
    }
  } catch (error) {
    debugLog.warn('call', 'RTC notification decryption failed', {
      eventId: event.getId(),
      roomId: event.getRoomId(),
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }

  const effectiveEvent = event.getEffectiveEvent();
  return {
    type: effectiveEvent.type,
    content: effectiveEvent.content,
  };
};

const canSenderStartCalls = (room: Room, senderId: string): boolean =>
  room.currentState?.maySendStateEvent('org.matrix.msc3401.call.member', senderId) ?? false;

export function useIncomingCallSignaling() {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const incomingCall = useAtomValue(incomingCallAtom);
  const mutedRoomId = useAtomValue(mutedCallRoomIdAtom);
  const setIncomingCall = useSetAtom(incomingCallAtom);
  const setMutedRoomId = useSetAtom(mutedCallRoomIdAtom);

  const incomingAudioRef = useRef<HTMLAudioElement | null>(null);
  const outgoingAudioRef = useRef<HTMLAudioElement | null>(null);
  const incomingCallRef = useRef<IncomingCall | null>(incomingCall);
  const mutedRoomIdRef = useRef<string | null>(mutedRoomId);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const outgoingRingRoomIdRef = useRef<string | null>(null);
  const outgoingStartRef = useRef<number | null>(null);

  incomingCallRef.current = incomingCall;
  mutedRoomIdRef.current = mutedRoomId;

  useEffect(() => {
    const incoming = new Audio(RingtoneSound);
    incoming.loop = true;
    incomingAudioRef.current = incoming;

    const outgoing = new Audio(RingtoneSound);
    outgoing.loop = true;
    outgoingAudioRef.current = outgoing;

    return () => {
      incoming.pause();
      outgoing.pause();
    };
  }, []);

  const stopIncomingRing = useCallback(() => {
    incomingAudioRef.current?.pause();
    if (incomingAudioRef.current) incomingAudioRef.current.currentTime = 0;
  }, []);

  const stopOutgoingRing = useCallback(() => {
    outgoingAudioRef.current?.pause();
    if (outgoingAudioRef.current) outgoingAudioRef.current.currentTime = 0;
    outgoingRingRoomIdRef.current = null;
    outgoingStartRef.current = null;
  }, []);

  const clearIncomingCall = useCallback(() => {
    stopIncomingRing();
    setIncomingCall(null);
  }, [setIncomingCall, stopIncomingRing]);

  const handleIncomingCall = useCallback(
    (nextIncomingCall: IncomingCall) => {
      if (mutedRoomIdRef.current === nextIncomingCall.roomId) return;
      if (seenNotificationIdsRef.current.has(nextIncomingCall.notificationEventId)) return;

      seenNotificationIdsRef.current.add(nextIncomingCall.notificationEventId);
      setIncomingCall(nextIncomingCall);

      debugLog.info('call', 'Incoming RTC notification accepted', {
        roomId: nextIncomingCall.roomId,
        notificationType: nextIncomingCall.notificationType,
        intent: nextIncomingCall.intentRaw,
      });
      Sentry.addBreadcrumb({
        category: 'call.signal',
        message: 'Incoming RTC notification',
        data: {
          roomId: nextIncomingCall.roomId,
          notificationType: nextIncomingCall.notificationType,
          intent: nextIncomingCall.intentRaw,
        },
      });
      Sentry.metrics.count('sable.call.incoming.shown', 1, {
        attributes: {
          type: nextIncomingCall.notificationType,
          dm: String(nextIncomingCall.isDirect),
        },
      });

      if (nextIncomingCall.notificationType === 'ring') {
        incomingAudioRef.current?.play().catch(() => {
          Sentry.metrics.count('sable.call.ringtone.blocked', 1);
        });
      } else {
        stopIncomingRing();
      }
    },
    [setIncomingCall, stopIncomingRing]
  );

  useEffect(() => {
    if (!mx || !mx.matrixRTC) return undefined;

    const myUserId = mx.getSafeUserId();

    const parseEvent = async (
      event: MatrixEvent,
      room: Room,
      liveEvent: boolean
    ): Promise<IncomingCall | undefined> => {
      const relation = event.getRelation();
      if (relation?.rel_type !== REFERENCE_REL_TYPE || !relation.event_id) return undefined;

      let eventType = event.getType();
      let content = event.getContent();

      if (event.isEncrypted()) {
        const decrypted = await decryptWithTimeout(event, mx);
        if (!decrypted?.content || !decrypted.type) {
          Sentry.metrics.count('sable.call.signal.decrypt_timeout', 1);
          return undefined;
        }
        eventType = decrypted.type;
        content = decrypted.content;
      }

      const parsed = await parseIncomingRtcNotification(
        {
          type: eventType,
          sender: event.getSender() ?? '',
          roomId: room.roomId,
          eventId: event.getId() ?? '',
          originServerTs: event.getTs(),
          content,
          relation: {
            rel_type: relation.rel_type,
            event_id: relation.event_id,
          },
          isLiveEvent: liveEvent,
          isEncrypted: false,
        },
        {
          myUserId,
          now: Date.now(),
          maxLifetimeMs: MAX_NOTIFICATION_LIFETIME_MS,
        }
      );

      if (!parsed) return undefined;
      if (!canSenderStartCalls(room, parsed.senderId)) {
        debugLog.warn('call', 'Rejected incoming call without call-member permission', {
          roomId: room.roomId,
          senderId: parsed.senderId,
        });
        return undefined;
      }

      return {
        ...parsed,
        isDirect: mDirects.has(room.roomId),
      };
    };

    const handleTimelineEvent: RoomEventHandlerMap[RoomEvent.Timeline] = async (
      event,
      room,
      _toStartOfTimeline,
      _removed,
      data
    ) => {
      if (!room || !data.liveEvent) return;

      const relation = event.getRelation();
      if (relation?.rel_type !== REFERENCE_REL_TYPE) return;

      const type = event.getType();
      if (type !== RTC_NOTIFICATION_EVENT_TYPE && !event.isEncrypted()) return;
      if (event.getSender() === myUserId) return;
      if (!event.getId()) return;

      const incoming = await parseEvent(event, room, data.liveEvent);
      if (!incoming) return;

      handleIncomingCall(incoming);
    };

    const evaluateFallbackState = () => {
      const currentIncoming = incomingCallRef.current;
      if (currentIncoming) {
        if (Date.now() >= currentIncoming.expiresAt) {
          debugLog.info('call', 'Incoming call timed out', {
            roomId: currentIncoming.roomId,
            notificationEventId: currentIncoming.notificationEventId,
          });
          Sentry.metrics.count('sable.call.timeout', 1);
          clearIncomingCall();
          return;
        }

        const incomingRoom = mx.getRoom(currentIncoming.roomId);
        if (!incomingRoom) {
          clearIncomingCall();
          return;
        }

        const session = mx.matrixRTC.getRoomSession(incomingRoom);
        if (!isIncomingCallActive(myUserId, incomingRoom, session.sessionDescription)) {
          debugLog.info('call', 'Incoming call cleared after membership drop', {
            roomId: currentIncoming.roomId,
          });
          clearIncomingCall();
          return;
        }
      }

      const outgoingRoomId = outgoingRingRoomIdRef.current;
      if (outgoingRoomId) {
        const outgoingRoom = mx.getRoom(outgoingRoomId);
        if (!outgoingRoom) {
          stopOutgoingRing();
          return;
        }
        const session = mx.matrixRTC.getRoomSession(outgoingRoom);
        if (isCallActive(myUserId, outgoingRoom, session.sessionDescription)) {
          stopOutgoingRing();
          return;
        }
      }

      if (outgoingRingRoomIdRef.current) return;

      const now = Date.now();
      const localUserId = mx.getUserId();
      if (!localUserId) return;

      for (const roomId of mDirects) {
        if (mutedRoomIdRef.current === roomId) continue;

        const room = mx.getRoom(roomId);
        if (!room) continue;

        const session = mx.matrixRTC.getRoomSession(room);
        const memberships = getRoomMemberships(room, session.sessionDescription);
        const remoteMembers = memberships.filter(
          (m: { userId?: string; sender?: string }) => (m.userId || m.sender) !== localUserId
        );
        const selfMember = memberships.some(
          (m: { userId?: string; sender?: string }) => (m.userId || m.sender) === localUserId
        );

        if (selfMember && remoteMembers.length === 0) {
          if (!outgoingStartRef.current) outgoingStartRef.current = now;
          if (now - outgoingStartRef.current < OUTGOING_RING_TIMEOUT_MS) {
            if (outgoingRingRoomIdRef.current !== roomId) {
              outgoingAudioRef.current?.play().catch(() => {});
              outgoingRingRoomIdRef.current = roomId;
              debugLog.info('call', 'Outgoing ringing fallback started', { roomId });
            }
          } else {
            stopOutgoingRing();
          }
          return;
        }
      }

      stopOutgoingRing();
    };

    const handleSessionEnded = (roomId: string) => {
      if (mutedRoomIdRef.current === roomId) setMutedRoomId(null);
      evaluateFallbackState();
    };

    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, evaluateFallbackState);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, handleSessionEnded);

    const intervalId = window.setInterval(evaluateFallbackState, FALLBACK_INTERVAL_MS);
    evaluateFallbackState();

    return () => {
      mx.off(RoomEvent.Timeline, handleTimelineEvent);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, evaluateFallbackState);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, handleSessionEnded);
      window.clearInterval(intervalId);
      stopIncomingRing();
      stopOutgoingRing();
    };
  }, [
    mx,
    mDirects,
    handleIncomingCall,
    clearIncomingCall,
    stopIncomingRing,
    stopOutgoingRing,
    setMutedRoomId,
  ]);

  return null;
}

export function useCallSignaling() {
  return useIncomingCallSignaling();
}
