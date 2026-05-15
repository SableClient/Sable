import { useCallback, useEffect, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import type { RoomEventHandlerMap, MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import {
  type CryptoBackend,
  MatrixRTCSession,
  MatrixRTCSessionManagerEvents,
  RoomEvent,
} from '$types/matrix-sdk';
import { mDirectAtom } from '$state/mDirectList';
import {
  callEmbedAtom,
  callSoundBlockedAtom,
  incomingCallAtom,
  mutedCallRoomIdAtom,
  type IncomingCall,
} from '$state/callEmbed';
import { settingsAtom } from '$state/settings';
import {
  parseRtcDecline,
  parseIncomingRtcNotification,
  RTC_DECLINE_EVENT_TYPE,
  REFERENCE_REL_TYPE,
  RTC_NOTIFICATION_EVENT_TYPE,
} from '$features/call/rtcNotificationParser';
import {
  callRingtoneVolumeToGain,
  canPlayCallAudio,
  resolveIncomingCallToneUrl,
  resolveOutgoingRingbackToneUrl,
} from '$features/call/callRingtone';
import { dismissSystemCallNotifications } from '$features/call/callNotificationBridge';
import { getCustomCallRingback, getCustomCallRingtone } from '$features/call/callRingtoneStorage';
import { useMatrixClient } from './useMatrixClient';
import { createDebugLogger } from '../utils/debugLogger';

const debugLog = createDebugLogger('CallSignaling');

const MAX_NOTIFICATION_LIFETIME_MS = 120_000;
const DECRYPT_TIMEOUT_MS = 8_000;
const FALLBACK_INTERVAL_MS = 5_000;
const OUTGOING_RING_TIMEOUT_MS = 30_000;
const DECLINE_DEBUG_MAX = 200;

type DeclineDebugEntry = {
  ts: number;
  phase: string;
  roomId?: string;
  eventId?: string;
  eventType?: string;
  encrypted?: boolean;
  detail?: string;
};

const pushDeclineDebug = (entry: DeclineDebugEntry): void => {
  const scope = globalThis as typeof globalThis & {
    __sableDeclineDebug?: DeclineDebugEntry[];
  };
  const queue = scope.__sableDeclineDebug ?? [];
  queue.push(entry);
  if (queue.length > DECLINE_DEBUG_MAX) queue.shift();
  scope.__sableDeclineDebug = queue;
};

type SessionDescription = Parameters<typeof MatrixRTCSession.sessionMembershipsForRoom>[1];
type RtcMembership = { userId?: string; sender?: string };

const getRoomMemberships = (room: Room, sessionDescription: SessionDescription) =>
  MatrixRTCSession.sessionMembershipsForRoom(room, sessionDescription);

const getCallMembershipPresence = (
  mxUserId: string,
  room: Room,
  sessionDescription: SessionDescription
) => {
  const memberships = getRoomMemberships(room, sessionDescription) as RtcMembership[];
  const remoteMemberCount = memberships.filter(
    (membership) => (membership.userId || membership.sender) !== mxUserId
  ).length;
  const hasSelfMember = memberships.some(
    (membership) => (membership.userId || membership.sender) === mxUserId
  );

  return { hasSelfMember, remoteMemberCount };
};

const isIncomingCallActive = (
  mxUserId: string,
  room: Room,
  sessionDescription: SessionDescription
): boolean => {
  const { hasSelfMember, remoteMemberCount } = getCallMembershipPresence(
    mxUserId,
    room,
    sessionDescription
  );

  return remoteMemberCount > 0 && !hasSelfMember;
};

const isCallActive = (
  mxUserId: string,
  room: Room,
  sessionDescription: SessionDescription
): boolean => {
  const { hasSelfMember, remoteMemberCount } = getCallMembershipPresence(
    mxUserId,
    room,
    sessionDescription
  );

  return hasSelfMember && remoteMemberCount > 0;
};

const isOutgoingCallPending = (
  mxUserId: string,
  room: Room,
  sessionDescription: SessionDescription
): boolean => {
  const { hasSelfMember, remoteMemberCount } = getCallMembershipPresence(
    mxUserId,
    room,
    sessionDescription
  );

  return hasSelfMember && remoteMemberCount === 0;
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
  const store = useStore();
  const callEmbed = useAtomValue(callEmbedAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const settings = useAtomValue(settingsAtom);
  const incomingCall = useAtomValue(incomingCallAtom);
  const mutedRoomId = useAtomValue(mutedCallRoomIdAtom);
  const setIncomingCall = useSetAtom(incomingCallAtom);
  const setMutedRoomId = useSetAtom(mutedCallRoomIdAtom);
  const setCallSoundBlocked = useSetAtom(callSoundBlockedAtom);
  const setCallEmbed = useSetAtom(callEmbedAtom);

  const incomingAudioRef = useRef<HTMLAudioElement | null>(null);
  const outgoingAudioRef = useRef<HTMLAudioElement | null>(null);
  const incomingCallRef = useRef<IncomingCall | null>(incomingCall);
  const mutedRoomIdRef = useRef<string | null>(mutedRoomId);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const outgoingRingRoomIdRef = useRef<string | null>(null);
  const declinedOutgoingRoomIdRef = useRef<string | null>(null);
  const outgoingDeclinesRef = useRef<
    Map<string, { notificationEventId: string; declinerIds: Set<string> }>
  >(new Map());
  const outgoingStartRef = useRef<number | null>(null);

  incomingCallRef.current = incomingCall;
  mutedRoomIdRef.current = mutedRoomId;

  useEffect(() => {
    declinedOutgoingRoomIdRef.current = null;
    outgoingDeclinesRef.current.clear();
  }, [callEmbed]);

  useEffect(() => {
    const incoming = new Audio();
    incoming.loop = true;
    incomingAudioRef.current = incoming;

    const outgoing = new Audio();
    outgoing.loop = true;
    outgoingAudioRef.current = outgoing;

    return () => {
      incoming.pause();
      outgoing.pause();
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    let customRingtoneUrl: string | undefined;
    let customRingbackUrl: string | undefined;

    const incoming = incomingAudioRef.current;
    const outgoing = outgoingAudioRef.current;
    if (!incoming || !outgoing) return undefined;

    const syncSources = async () => {
      if (settings.callRingtoneId === 'custom') {
        const customRingtone = await getCustomCallRingtone().catch(() => undefined);
        if (customRingtone?.blob) {
          customRingtoneUrl = URL.createObjectURL(customRingtone.blob);
        }
      }

      if (settings.callRingbackTone === 'custom') {
        const customRingback = await getCustomCallRingback().catch(() => undefined);
        if (customRingback?.blob) {
          customRingbackUrl = URL.createObjectURL(customRingback.blob);
        }
      }

      if (canceled) return;

      incoming.pause();
      incoming.currentTime = 0;
      outgoing.pause();
      outgoing.currentTime = 0;

      const incomingTone = resolveIncomingCallToneUrl(
        {
          callRingtoneId: settings.callRingtoneId,
        },
        customRingtoneUrl
      );
      const outgoingTone = resolveOutgoingRingbackToneUrl(
        {
          callRingtoneId: settings.callRingtoneId,
          callRingbackTone: settings.callRingbackTone,
        },
        customRingtoneUrl,
        customRingbackUrl
      );
      const gain = callRingtoneVolumeToGain(settings.callRingtoneVolume);

      if (incomingTone) {
        incoming.src = incomingTone;
      } else {
        incoming.removeAttribute('src');
      }
      if (outgoingTone) {
        outgoing.src = outgoingTone;
      } else {
        outgoing.removeAttribute('src');
      }

      incoming.volume = gain;
      outgoing.volume = gain;
    };

    syncSources();

    return () => {
      canceled = true;
      if (customRingtoneUrl) URL.revokeObjectURL(customRingtoneUrl);
      if (customRingbackUrl) URL.revokeObjectURL(customRingbackUrl);
    };
  }, [settings.callRingtoneId, settings.callRingbackTone, settings.callRingtoneVolume]);

  const stopIncomingRing = useCallback(() => {
    incomingAudioRef.current?.pause();
    if (incomingAudioRef.current) incomingAudioRef.current.currentTime = 0;
    setCallSoundBlocked(false);
  }, [setCallSoundBlocked]);

  const stopOutgoingRing = useCallback(() => {
    outgoingAudioRef.current?.pause();
    if (outgoingAudioRef.current) outgoingAudioRef.current.currentTime = 0;
    if (callEmbed) {
      callEmbed.control.setOutputOverrideMuted(false);
    }
    outgoingRingRoomIdRef.current = null;
    outgoingStartRef.current = null;
  }, [callEmbed]);

  const clearIncomingCall = useCallback(() => {
    const activeIncomingCall = incomingCallRef.current;
    stopIncomingRing();
    setIncomingCall(null);
    if (activeIncomingCall) {
      void dismissSystemCallNotifications(activeIncomingCall.roomId);
    }
  }, [setIncomingCall, stopIncomingRing]);

  const handleOutgoingDecline = useCallback(
    (decline: {
      roomId: string;
      declineEventId: string;
      notificationEventId: string;
      senderId: string;
    }) => {
      if (!callEmbed || callEmbed.roomId !== decline.roomId) {
        pushDeclineDebug({
          ts: Date.now(),
          phase: 'handle_skip',
          roomId: decline.roomId,
          eventId: decline.declineEventId,
          eventType: RTC_DECLINE_EVENT_TYPE,
          detail: 'no_active_embed_for_room',
        });
        return;
      }

      const outgoingRoom = mx.getRoom(decline.roomId);
      if (!outgoingRoom) {
        pushDeclineDebug({
          ts: Date.now(),
          phase: 'handle_skip',
          roomId: decline.roomId,
          eventId: decline.declineEventId,
          eventType: RTC_DECLINE_EVENT_TYPE,
          detail: 'missing_room',
        });
        return;
      }

      const isDirectRoom = mDirects.has(decline.roomId);
      const remoteJoinedIds = new Set(
        outgoingRoom
          .getJoinedMembers()
          .map((member) => member.userId)
          .filter((userId) => userId !== mx.getSafeUserId())
      );

      const trackedDecline = outgoingDeclinesRef.current.get(decline.roomId);
      const declineState =
        trackedDecline && trackedDecline.notificationEventId === decline.notificationEventId
          ? trackedDecline
          : {
              notificationEventId: decline.notificationEventId,
              declinerIds: new Set<string>(),
            };
      declineState.declinerIds.add(decline.senderId);
      outgoingDeclinesRef.current.set(decline.roomId, declineState);

      const allRemoteDeclined =
        remoteJoinedIds.size > 0 &&
        [...remoteJoinedIds].every((userId) => declineState.declinerIds.has(userId));
      const treatAsOneToOne = isDirectRoom || remoteJoinedIds.size <= 1;

      if (!treatAsOneToOne && remoteJoinedIds.size > 0 && !allRemoteDeclined) {
        pushDeclineDebug({
          ts: Date.now(),
          phase: 'handle_partial',
          roomId: decline.roomId,
          eventId: decline.declineEventId,
          eventType: RTC_DECLINE_EVENT_TYPE,
          detail: `${declineState.declinerIds.size}/${remoteJoinedIds.size}`,
        });
        debugLog.info('call', 'Ignoring partial outgoing decline for group call', {
          roomId: decline.roomId,
          declineEventId: decline.declineEventId,
          notificationEventId: decline.notificationEventId,
          declinedCount: declineState.declinerIds.size,
          targetCount: remoteJoinedIds.size,
        });
        Sentry.metrics.count('sable.call.outgoing.declined.partial', 1);
        return;
      }

      declinedOutgoingRoomIdRef.current = decline.roomId;
      pushDeclineDebug({
        ts: Date.now(),
        phase: 'handle_end',
        roomId: decline.roomId,
        eventId: decline.declineEventId,
        eventType: RTC_DECLINE_EVENT_TYPE,
        detail: `${declineState.declinerIds.size}/${remoteJoinedIds.size}`,
      });
      debugLog.info('call', 'Outgoing call declined and ending call', {
        roomId: decline.roomId,
        declineEventId: decline.declineEventId,
        notificationEventId: decline.notificationEventId,
        declinedCount: declineState.declinerIds.size,
        targetCount: remoteJoinedIds.size,
      });
      Sentry.metrics.count('sable.call.outgoing.declined', 1);
      stopOutgoingRing();

      void callEmbed
        .hangup()
        .catch((error) => {
          pushDeclineDebug({
            ts: Date.now(),
            phase: 'hangup_error',
            roomId: decline.roomId,
            eventId: decline.declineEventId,
            eventType: RTC_DECLINE_EVENT_TYPE,
            detail: error instanceof Error ? error.message : String(error),
          });
          debugLog.warn('call', 'Failed to hang up after outgoing decline', {
            roomId: decline.roomId,
            error: error instanceof Error ? error.message : String(error),
          });
          Sentry.metrics.count('sable.call.outgoing.decline_hangup_error', 1);
        })
        .finally(() => {
          pushDeclineDebug({
            ts: Date.now(),
            phase: 'hangup_finally',
            roomId: decline.roomId,
            eventId: decline.declineEventId,
            eventType: RTC_DECLINE_EVENT_TYPE,
          });
          window.setTimeout(() => {
            const activeEmbed = store.get(callEmbedAtom);
            if (activeEmbed !== callEmbed) return;
            setCallEmbed(undefined);
          }, 2_000);
        });
    },
    [callEmbed, mDirects, mx, setCallEmbed, stopOutgoingRing, store]
  );

  const callAudioAllowed = canPlayCallAudio({
    isNotificationSounds: settings.isNotificationSounds,
    callSoundOverrideGlobalNotifications: settings.callSoundOverrideGlobalNotifications,
  });
  const incomingRingtoneAllowed = settings.incomingCallSoundEnabled && callAudioAllowed;
  const outgoingRingbackAllowed = settings.outgoingRingbackEnabled && callAudioAllowed;

  useEffect(() => {
    if (!incomingRingtoneAllowed) {
      stopIncomingRing();
    }
    if (!outgoingRingbackAllowed) {
      stopOutgoingRing();
    }
  }, [incomingRingtoneAllowed, outgoingRingbackAllowed, stopIncomingRing, stopOutgoingRing]);

  useEffect(() => {
    if (!incomingCall) {
      stopIncomingRing();
    }
  }, [incomingCall, stopIncomingRing]);

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

      if (!incomingRingtoneAllowed) {
        stopIncomingRing();
        return;
      }

      incomingAudioRef.current
        ?.play()
        .then(() => {
          setCallSoundBlocked(false);
        })
        .catch(() => {
          setCallSoundBlocked(true);
          Sentry.metrics.count('sable.call.ringtone.blocked', 1);
        });
    },
    [incomingRingtoneAllowed, setCallSoundBlocked, setIncomingCall, stopIncomingRing]
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

    const parseDeclineEvent = async (
      event: MatrixEvent,
      room: Room,
      liveEvent: boolean
    ): Promise<ReturnType<typeof parseRtcDecline>> => {
      pushDeclineDebug({
        ts: Date.now(),
        phase: 'parse_start',
        roomId: room.roomId,
        eventId: event.getId() ?? undefined,
        eventType: event.getType(),
        encrypted: event.isEncrypted(),
      });
      let eventType = event.getType();
      let content = event.getContent();

      if (event.isEncrypted()) {
        const decrypted = await decryptWithTimeout(event, mx);
        if (!decrypted?.content || !decrypted.type) {
          pushDeclineDebug({
            ts: Date.now(),
            phase: 'parse_decrypt_fallback',
            roomId: room.roomId,
            eventId: event.getId() ?? undefined,
            eventType: event.getType(),
            encrypted: event.isEncrypted(),
            detail: 'decrypt_timeout_or_missing_content',
          });
          Sentry.metrics.count('sable.call.signal.decrypt_timeout', 1);
        } else {
          eventType = decrypted.type;
          content = decrypted.content;
          pushDeclineDebug({
            ts: Date.now(),
            phase: 'parse_decrypted',
            roomId: room.roomId,
            eventId: event.getId() ?? undefined,
            eventType,
            encrypted: event.isEncrypted(),
          });
        }
      }

      const relationFromContent = (() => {
        if (!content || typeof content !== 'object') return undefined;
        const maybeRelates = (content as { 'm.relates_to'?: unknown })['m.relates_to'];
        if (!maybeRelates || typeof maybeRelates !== 'object') return undefined;
        const relation = maybeRelates as { rel_type?: unknown; event_id?: unknown };
        return {
          rel_type: typeof relation.rel_type === 'string' ? relation.rel_type : undefined,
          event_id: typeof relation.event_id === 'string' ? relation.event_id : undefined,
        };
      })();
      const relation = event.getRelation() ?? relationFromContent;

      const parsed = parseRtcDecline(
        {
          type: eventType,
          sender: event.getSender() ?? '',
          roomId: room.roomId,
          eventId: event.getId() ?? '',
          originServerTs: event.getTs(),
          content,
          relation: relation
            ? {
                rel_type: relation.rel_type,
                event_id: relation.event_id,
              }
            : undefined,
          isLiveEvent: liveEvent,
          isEncrypted: false,
        },
        { myUserId }
      );
      pushDeclineDebug({
        ts: Date.now(),
        phase: parsed ? 'parse_match' : 'parse_skip',
        roomId: room.roomId,
        eventId: event.getId() ?? undefined,
        eventType,
        encrypted: event.isEncrypted(),
        detail: parsed ? 'decline_parsed' : 'type_or_sender_mismatch',
      });
      return parsed;
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
      if (relation?.rel_type !== REFERENCE_REL_TYPE && !event.isEncrypted()) return;

      const type = event.getType();
      if (
        type !== RTC_NOTIFICATION_EVENT_TYPE &&
        type !== RTC_DECLINE_EVENT_TYPE &&
        !event.isEncrypted()
      ) {
        return;
      }
      if (event.getSender() === myUserId) return;
      if (!event.getId()) return;

      const incoming = await parseEvent(event, room, data.liveEvent);
      if (incoming) {
        handleIncomingCall(incoming);
        return;
      }

      // Avoid decrypting unrelated encrypted timeline traffic; only inspect declines
      // for the currently active outgoing call room.
      const shouldCheckDecline =
        !!callEmbed &&
        callEmbed.roomId === room.roomId &&
        (event.isEncrypted() || type === RTC_DECLINE_EVENT_TYPE);
      if (!shouldCheckDecline) {
        if (event.isEncrypted() || type === RTC_DECLINE_EVENT_TYPE) {
          pushDeclineDebug({
            ts: Date.now(),
            phase: 'timeline_skip',
            roomId: room.roomId,
            eventId: event.getId() ?? undefined,
            eventType: type,
            encrypted: event.isEncrypted(),
            detail: `activeRoom=${callEmbed?.roomId ?? 'none'}`,
          });
        }
        return;
      }

      const decline = await parseDeclineEvent(event, room, data.liveEvent);
      if (decline) {
        pushDeclineDebug({
          ts: Date.now(),
          phase: 'timeline_match',
          roomId: room.roomId,
          eventId: event.getId() ?? undefined,
          eventType: type,
          encrypted: event.isEncrypted(),
        });
        handleOutgoingDecline(decline);
        return;
      }
    };

    const evaluateFallbackState = () => {
      const now = Date.now();

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
          // Session membership can lag behind live RTC notification delivery.
          // Keep ringing for a short grace window before treating the call as ended.
          if (now - currentIncoming.senderTs < 15_000) {
            return;
          }
          debugLog.info('call', 'Incoming call cleared after membership drop', {
            roomId: currentIncoming.roomId,
          });
          clearIncomingCall();
          return;
        }
      }

      const activeCallRoomId = callEmbed?.roomId;
      if (!activeCallRoomId || !outgoingRingbackAllowed) {
        stopOutgoingRing();
        return;
      }
      if (declinedOutgoingRoomIdRef.current === activeCallRoomId) {
        stopOutgoingRing();
        return;
      }

      const outgoingRoom = mx.getRoom(activeCallRoomId);
      if (!outgoingRoom) {
        stopOutgoingRing();
        return;
      }

      const session = mx.matrixRTC.getRoomSession(outgoingRoom);
      const pendingOutgoing = isOutgoingCallPending(
        myUserId,
        outgoingRoom,
        session.sessionDescription
      );
      const activeCall = isCallActive(myUserId, outgoingRoom, session.sessionDescription);

      if (!pendingOutgoing || activeCall) {
        stopOutgoingRing();
        return;
      }

      if (outgoingRingRoomIdRef.current !== activeCallRoomId) {
        outgoingRingRoomIdRef.current = activeCallRoomId;
        outgoingStartRef.current = now;
        debugLog.info('call', 'Outgoing ringing fallback started', { roomId: activeCallRoomId });
      }

      if (outgoingStartRef.current && now - outgoingStartRef.current >= OUTGOING_RING_TIMEOUT_MS) {
        stopOutgoingRing();
        return;
      }

      callEmbed.control.setOutputOverrideMuted(true);
      outgoingAudioRef.current?.play().catch(() => {
        Sentry.metrics.count('sable.call.ringback.blocked', 1);
      });
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
    callEmbed,
    mx,
    mDirects,
    outgoingRingbackAllowed,
    handleIncomingCall,
    handleOutgoingDecline,
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
