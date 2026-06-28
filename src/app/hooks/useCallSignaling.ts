import { useCallback, useEffect, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import type { RoomEventHandlerMap, MatrixEvent, Room } from '$types/matrix-sdk';
import { MatrixRTCSessionManagerEvents, RoomEvent } from '$types/matrix-sdk';
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
  parseIncomingRtcNotification,
  RTC_DECLINE_EVENT_TYPE,
  REFERENCE_REL_TYPE,
  RTC_NOTIFICATION_EVENT_TYPE,
} from '$features/call/rtcNotificationParser';
import { decryptRtcTimelineEvent } from '$features/call/callSignalingDecrypt';
import {
  FALLBACK_INTERVAL_MS,
  MAX_NOTIFICATION_LIFETIME_MS,
  OUTGOING_DECLINE_EMBED_CLEAR_MS,
} from '$features/call/callSignalingPolicy';
import {
  applyOutgoingDeclineToTracker,
  type OutgoingDeclineEvent,
} from '$features/call/outgoingDeclineHandler';
import { parseRtcDeclineFromTimelineEvent } from '$features/call/rtcTimelineDecline';
import {
  evaluateIncomingCallFallback,
  evaluateOutgoingRingbackFallback,
} from '$features/call/callSignalingFallback';
import { callRingtoneVolumeToGain, canPlayCallAudio } from '$features/call/callRingtone';
import { dismissSystemCallNotifications } from '$features/call/callNotificationBridge';
import { resolveCallToneSources } from '$features/call/callToneSources';
import { isIncomingCallSuppressed } from '$features/call/callIncomingIngress';
import { getRemoteRtcMemberUserIds, isCallActive } from '$features/call/callMembershipState';
import { useMatrixClient } from './useMatrixClient';
import { createDebugLogger } from '../utils/debugLogger';

const debugLog = createDebugLogger('CallSignaling');

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
  const MAX_SEEN_NOTIFICATION_IDS = 256;

  const rememberNotificationId = (notificationEventId: string) => {
    const seen = seenNotificationIdsRef.current;
    if (seen.has(notificationEventId)) return false;
    seen.add(notificationEventId);
    while (seen.size > MAX_SEEN_NOTIFICATION_IDS) {
      const oldest = seen.values().next().value;
      if (!oldest) break;
      seen.delete(oldest);
    }
    return true;
  };
  const outgoingRingRoomIdRef = useRef<string | null>(null);
  const declinedOutgoingRoomIdRef = useRef<string | null>(null);
  const outgoingDeclinesRef = useRef<
    Map<string, { notificationEventId: string; declinerIds: Set<string> }>
  >(new Map());
  const outgoingStartRef = useRef<number | null>(null);
  const activeOutgoingNotificationIdRef = useRef<string | null>(null);
  const seenDeclineEventIdsRef = useRef<Set<string>>(new Set());
  const hasCallBeenActiveRef = useRef<boolean>(false);

  type SignalingHandlerRefs = {
    callEmbed: typeof callEmbed;
    mDirects: typeof mDirects;
    outgoingRingbackAllowed: boolean;
    handleIncomingCall: (incoming: IncomingCall) => void;
    handleOutgoingDecline: (decline: {
      roomId: string;
      declineEventId: string;
      notificationEventId: string;
      senderId: string;
    }) => void;
    clearIncomingCall: () => void;
    stopIncomingRing: () => void;
    stopOutgoingRing: () => void;
    setMutedRoomId: (roomId: string | null) => void;
  };

  const signalingHandlerRefs = useRef<SignalingHandlerRefs | null>(null);

  incomingCallRef.current = incomingCall;
  mutedRoomIdRef.current = mutedRoomId;

  useEffect(() => {
    declinedOutgoingRoomIdRef.current = null;
    outgoingDeclinesRef.current.clear();
    activeOutgoingNotificationIdRef.current = null;
    seenDeclineEventIdsRef.current.clear();
    hasCallBeenActiveRef.current = false;
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
    let revokeToneUrls: (() => void) | undefined;

    const incoming = incomingAudioRef.current;
    const outgoing = outgoingAudioRef.current;
    if (!incoming || !outgoing) return undefined;

    const syncSources = async () => {
      const resolved = await resolveCallToneSources({
        callRingtoneId: settings.callRingtoneId,
        callRingbackTone: settings.callRingbackTone,
      });

      if (canceled) {
        resolved.revoke();
        return;
      }

      revokeToneUrls?.();
      revokeToneUrls = resolved.revoke;

      incoming.pause();
      incoming.currentTime = 0;
      outgoing.pause();
      outgoing.currentTime = 0;

      const gain = callRingtoneVolumeToGain(settings.callRingtoneVolume);

      if (resolved.incomingUrl) {
        incoming.src = resolved.incomingUrl;
      } else {
        incoming.removeAttribute('src');
      }
      if (resolved.outgoingUrl) {
        outgoing.src = resolved.outgoingUrl;
      } else {
        outgoing.removeAttribute('src');
      }

      incoming.volume = gain;
      outgoing.volume = gain;
    };

    syncSources();

    return () => {
      canceled = true;
      revokeToneUrls?.();
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
    outgoingRingRoomIdRef.current = null;
    outgoingStartRef.current = null;
  }, []);

  const clearIncomingCall = useCallback(() => {
    const activeIncomingCall = incomingCallRef.current;
    stopIncomingRing();
    setIncomingCall(null);
    if (activeIncomingCall) {
      void dismissSystemCallNotifications(activeIncomingCall.roomId);
    }
  }, [setIncomingCall, stopIncomingRing]);

  const handleOutgoingDecline = useCallback(
    (decline: OutgoingDeclineEvent) => {
      if (!callEmbed || callEmbed.roomId !== decline.roomId) {
        return;
      }

      if (seenDeclineEventIdsRef.current.has(decline.declineEventId)) {
        return;
      }
      seenDeclineEventIdsRef.current.add(decline.declineEventId);

      const activeNotificationId = activeOutgoingNotificationIdRef.current;
      if (activeNotificationId && decline.notificationEventId !== activeNotificationId) {
        debugLog.info('call', 'Ignoring stale outgoing decline for previous notification', {
          roomId: decline.roomId,
          declineEventId: decline.declineEventId,
          notificationEventId: decline.notificationEventId,
          activeNotificationId,
        });
        return;
      }

      const outgoingRoom = mx.getRoom(decline.roomId);
      if (!outgoingRoom) {
        return;
      }

      const myUserId = mx.getSafeUserId();
      const sessionDescription = mx.matrixRTC.getRoomSession(outgoingRoom).sessionDescription;
      let remoteJoinedIds = getRemoteRtcMemberUserIds(myUserId, outgoingRoom, sessionDescription);
      if (remoteJoinedIds.size === 0) {
        remoteJoinedIds = new Set([decline.senderId]);
      }

      const decision = applyOutgoingDeclineToTracker(outgoingDeclinesRef.current, decline, {
        remoteJoinedIds,
        isDirectRoom: mDirects.has(decline.roomId),
      });

      if (decision.kind === 'ignore_partial') {
        debugLog.info('call', 'Ignoring partial outgoing decline for group call', {
          roomId: decline.roomId,
          declineEventId: decline.declineEventId,
          notificationEventId: decline.notificationEventId,
          declinedCount: decision.declinedCount,
          targetCount: decision.targetCount,
        });
        Sentry.metrics.count('sable.call.outgoing.declined.partial', 1);
        return;
      }

      declinedOutgoingRoomIdRef.current = decline.roomId;
      debugLog.info('call', 'Outgoing call declined and ending call', {
        roomId: decline.roomId,
        declineEventId: decline.declineEventId,
        notificationEventId: decline.notificationEventId,
        declinedCount: decision.declinedCount,
        targetCount: decision.targetCount,
      });
      Sentry.metrics.count('sable.call.outgoing.declined', 1);
      stopOutgoingRing();

      void callEmbed
        .hangup()
        .catch((error) => {
          debugLog.warn('call', 'Failed to hang up after outgoing decline', {
            roomId: decline.roomId,
            error: error instanceof Error ? error.message : String(error),
          });
          Sentry.metrics.count('sable.call.outgoing.decline_hangup_error', 1);
        })
        .finally(() => {
          window.setTimeout(() => {
            const activeEmbed = store.get(callEmbedAtom);
            if (activeEmbed !== callEmbed) return;
            setCallEmbed(undefined);
          }, OUTGOING_DECLINE_EMBED_CLEAR_MS);
        });
    },
    [callEmbed, mDirects, mx, setCallEmbed, stopOutgoingRing, store]
  );

  const callAudioAllowed = canPlayCallAudio({
    isNotificationSounds: settings.isNotificationSounds,
    callSoundOverrideGlobalNotifications: settings.callSoundOverrideGlobalNotifications,
  });
  const incomingRingtoneAllowed = settings.incomingCallSoundEnabled && callAudioAllowed;
  const outgoingRingbackAllowed =
    settings.outgoingRingbackEnabled &&
    callAudioAllowed &&
    settings.callRingbackTone !== 'silent';
  const incomingToneIsSilent = settings.callRingtoneId === 'silent';

  const handleIncomingCall = useCallback(
    (nextIncomingCall: IncomingCall) => {
      if (
        isIncomingCallSuppressed(
          nextIncomingCall,
          mutedRoomIdRef.current,
          settings.incomingVoiceRoomCallSoundEnabled
        )
      )
        return;
      if (!rememberNotificationId(nextIncomingCall.notificationEventId)) return;
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
    },
    [setIncomingCall]
  );

  const playIncomingRing = useCallback(() => {
    if (!incomingRingtoneAllowed || incomingToneIsSilent) {
      stopIncomingRing();
      return;
    }

    const audio = incomingAudioRef.current;
    if (!audio?.src) {
      stopIncomingRing();
      return;
    }

    if (callEmbed && incomingCall && callEmbed.roomId !== incomingCall.roomId) {
      stopIncomingRing();
      return;
    }

    audio
      .play()
      .then(() => {
        setCallSoundBlocked(false);
      })
      .catch(() => {
        setCallSoundBlocked(true);
        Sentry.metrics.count('sable.call.ringtone.blocked', 1);
      });
  }, [
    callEmbed,
    incomingCall,
    incomingRingtoneAllowed,
    incomingToneIsSilent,
    setCallSoundBlocked,
    stopIncomingRing,
  ]);

  signalingHandlerRefs.current = {
    callEmbed,
    mDirects,
    outgoingRingbackAllowed,
    handleIncomingCall,
    handleOutgoingDecline,
    clearIncomingCall,
    stopIncomingRing,
    stopOutgoingRing,
    setMutedRoomId,
  };

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
      return;
    }
    if (
      isIncomingCallSuppressed(incomingCall, mutedRoomId, settings.incomingVoiceRoomCallSoundEnabled)
    ) {
      setIncomingCall(null);
      return;
    }
    playIncomingRing();
  }, [incomingCall, mutedRoomId, playIncomingRing, setIncomingCall, stopIncomingRing]);

  useEffect(() => {
    if (!mx || !mx.matrixRTC) return undefined;

    const myUserId = mx.getSafeUserId();
    const handlers = () => signalingHandlerRefs.current!;

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
        const decrypted = await decryptRtcTimelineEvent(event, mx);
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
        isDirect: handlers().mDirects.has(room.roomId),
      };
    };

    let timelineHandlerEpoch = 0;

    const handleTimelineEvent: RoomEventHandlerMap[RoomEvent.Timeline] = async (
      event,
      room,
      _toStartOfTimeline,
      _removed,
      data
    ) => {
      if (!room || !data.liveEvent) return;

      const epochAtStart = timelineHandlerEpoch;
      const isStale = () => epochAtStart !== timelineHandlerEpoch;

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
      const senderId = event.getSender();
      const eventId = event.getId();
      if (!senderId || !eventId) return;

      if (senderId === myUserId) {
        if (type === RTC_NOTIFICATION_EVENT_TYPE && handlers().callEmbed?.roomId === room.roomId) {
          activeOutgoingNotificationIdRef.current = eventId;
        }
        return;
      }

      const incoming = await parseEvent(event, room, data.liveEvent);
      if (isStale()) return;
      if (incoming) {
        handlers().handleIncomingCall(incoming);
        return;
      }

      // Only inspect declines for the active outgoing call room. Cleartext declines are
      // cheap; encrypted events are decrypted only when they might be RTC declines.
      const activeEmbed = handlers().callEmbed;
      if (!activeEmbed || activeEmbed.roomId !== room.roomId) {
        return;
      }
      if (event.isDecryptionFailure()) {
        return;
      }
      const shouldCheckDecline =
        type === RTC_DECLINE_EVENT_TYPE ||
        (event.isEncrypted() && relation?.rel_type === REFERENCE_REL_TYPE);
      if (!shouldCheckDecline) {
        return;
      }

      const decline = await parseRtcDeclineFromTimelineEvent(
        event,
        room,
        data.liveEvent,
        myUserId,
        mx
      );
      if (isStale()) return;
      if (decline) {
        handlers().handleOutgoingDecline(decline);
      }
    };

    const fallbackContext = {
      myUserId,
      getRoom: (roomId: string) => mx.getRoom(roomId),
      getSessionDescription: (room: Room) => mx.matrixRTC.getRoomSession(room).sessionDescription,
    };

    const evaluateIncomingFallback = () => {
      const action = evaluateIncomingCallFallback(
        incomingCallRef.current,
        Date.now(),
        fallbackContext
      );
      if (action.kind !== 'clear') return;

      if (action.reason === 'expired') {
        const currentIncoming = incomingCallRef.current;
        debugLog.info('call', 'Incoming call timed out', {
          roomId: currentIncoming?.roomId,
          notificationEventId: currentIncoming?.notificationEventId,
        });
        Sentry.metrics.count('sable.call.timeout', 1);
      } else if (action.reason === 'membership_dropped') {
        debugLog.info('call', 'Incoming call cleared after membership drop', {
          roomId: incomingCallRef.current?.roomId,
        });
      }

      handlers().clearIncomingCall();
    };

    const evaluateOutgoingFallback = () => {
      const activeCallRoomId = handlers().callEmbed?.roomId;
      const outgoingRoom = activeCallRoomId ? mx.getRoom(activeCallRoomId) : null;
      if (outgoingRoom) {
        const session = mx.matrixRTC.getRoomSession(outgoingRoom).sessionDescription;
        if (isCallActive(myUserId, outgoingRoom, session)) {
          hasCallBeenActiveRef.current = true;
        }
      }

      const ringAction = evaluateOutgoingRingbackFallback(
        {
          ringRoomId: outgoingRingRoomIdRef.current,
          ringStartedAt: outgoingStartRef.current,
        },
        Date.now(),
        {
          ...fallbackContext,
          activeCallRoomId,
          isDirectRoom: (roomId: string) => handlers().mDirects.has(roomId),
          outgoingRingbackAllowed: handlers().outgoingRingbackAllowed,
          declinedRoomId: declinedOutgoingRoomIdRef.current,
          hasCallBeenActive: hasCallBeenActiveRef.current,
        }
      );

      outgoingRingRoomIdRef.current = ringAction.nextState.ringRoomId;
      outgoingStartRef.current = ringAction.nextState.ringStartedAt;

      if (ringAction.kind === 'stop') {
        handlers().stopOutgoingRing();
        return;
      }

      if (ringAction.started) {
        debugLog.info('call', 'Outgoing ringing fallback started', { roomId: ringAction.roomId });
      }

      const outgoingAudio = outgoingAudioRef.current;
      if (outgoingAudio && (ringAction.started || outgoingAudio.paused)) {
        outgoingAudio.play().catch(() => {
          Sentry.metrics.count('sable.call.ringback.blocked', 1);
        });
      }
    };

    const evaluateFallbackState = () => {
      evaluateIncomingFallback();
      evaluateOutgoingFallback();
    };

    const handleSessionEnded = (roomId: string) => {
      if (mutedRoomIdRef.current === roomId) handlers().setMutedRoomId(null);
      evaluateFallbackState();
    };

    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, evaluateFallbackState);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, handleSessionEnded);

    const intervalId = window.setInterval(evaluateFallbackState, FALLBACK_INTERVAL_MS);
    evaluateFallbackState();

    return () => {
      timelineHandlerEpoch += 1;
      mx.off(RoomEvent.Timeline, handleTimelineEvent);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, evaluateFallbackState);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, handleSessionEnded);
      window.clearInterval(intervalId);
      handlers().stopIncomingRing();
      handlers().stopOutgoingRing();
    };
  }, [mx]);

  return null;
}
