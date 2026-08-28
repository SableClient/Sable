import {
  FALLBACK_INTERVAL_MS,
  MAX_NOTIFICATION_LIFETIME_MS,
  OUTGOING_DECLINE_EMBED_CLEAR_MS,
  OUTGOING_RING_TIMEOUT_MS,
  type OutgoingDeclineEvent,
  REFERENCE_REL_TYPE,
  RTC_DECLINE_EVENT_TYPE,
  RTC_NOTIFICATION_EVENT_TYPE,
  applyOutgoingDeclineToTracker,
  decryptRtcTimelineEvent,
  getRemoteRtcMemberUserIds,
  isCallActive,
  isOutgoingCallPending,
  parseIncomingRtcNotification,
} from '@sableclient/matrixrtc';
import { useCallback, useEffect, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import {
  EventType,
  type RoomEventHandlerMap,
  type MatrixEvent,
  type Room,
} from '$types/matrix-sdk';
import { MatrixRTCSessionManagerEvents, RoomEvent } from '$types/matrix-sdk';
import { mDirectAtom } from '$state/mDirectList';
import {
  callEmbedAtom,
  callSoundBlockedAtom,
  incomingCallAtom,
  mutedCallRoomIdAtom,
  type IncomingCall,
} from '$state/callEmbed';
import { livekitJsCallAtom } from '$state/livekitJsCall';
import { nativeCallAtom, selectActiveCallSessionIncludingNative } from '$state/nativeCall';
import { settingsAtom } from '$state/settings';
import { parseRtcDeclineFromTimelineEvent } from '$features/call/rtcTimelineDecline';
import { evaluateIncomingCallFallback } from '$features/call/callSignalingFallback';
import { canPlayCallAudio } from '$features/call/callRingtone';
import { dismissSystemCallNotifications } from '$features/call/callNotificationBridge';
import { isIncomingCallSuppressed } from '$features/call/callIncomingIngress';
import { ringtoneManager } from '$features/call/CallRingtoneManager';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('CallSignaling');

const canSenderStartCalls = (room: Room, senderId: string): boolean =>
  room.currentState?.maySendStateEvent(EventType.RTCMembership, senderId) ||
  room.currentState?.maySendStateEvent(EventType.GroupCallMemberPrefix, senderId) ||
  false;

export function useIncomingCallSignaling() {
  const mx = useMatrixClient();
  const store = useStore();
  const callEmbed = useAtomValue(callEmbedAtom);
  const livekitJsCall = useAtomValue(livekitJsCallAtom);
  const nativeCall = useAtomValue(nativeCallAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const settings = useAtomValue(settingsAtom);
  const incomingCall = useAtomValue(incomingCallAtom);
  const mutedRoomId = useAtomValue(mutedCallRoomIdAtom);
  const setIncomingCall = useSetAtom(incomingCallAtom);
  const setMutedRoomId = useSetAtom(mutedCallRoomIdAtom);
  const setCallSoundBlocked = useSetAtom(callSoundBlockedAtom);
  const setCallEmbed = useSetAtom(callEmbedAtom);

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
    livekitJsCall: typeof livekitJsCall;
    nativeCall: typeof nativeCall;
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
    outgoingRingRoomIdRef.current = null;
    outgoingStartRef.current = null;
  }, [callEmbed?.roomId, livekitJsCall?.roomId, nativeCall?.roomId]);

  useEffect(() => {
    ringtoneManager.syncSources(
      settings.callRingtoneId,
      settings.callRingbackTone,
      settings.callRingtoneVolume
    );
  }, [settings.callRingtoneId, settings.callRingbackTone, settings.callRingtoneVolume]);

  const stopIncomingRing = useCallback(() => {
    ringtoneManager.stopIncoming();
    setCallSoundBlocked(false);
  }, [setCallSoundBlocked]);

  const stopOutgoingRing = useCallback(() => {
    ringtoneManager.stopOutgoing();
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
      const activeCall = selectActiveCallSessionIncludingNative(
        callEmbed,
        livekitJsCall,
        nativeCall
      );
      if (!activeCall || activeCall.roomId !== decline.roomId) {
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
      const rtcSession = mx.matrixRTC.getRoomSession(outgoingRoom);
      let remoteJoinedIds = getRemoteRtcMemberUserIds(myUserId, rtcSession.memberships);
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

      const hangup =
        selectActiveCallSessionIncludingNative(callEmbed, livekitJsCall, nativeCall)?.hangup() ??
        Promise.resolve();
      void hangup
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
            if (activeEmbed === callEmbed) setCallEmbed(undefined);
          }, OUTGOING_DECLINE_EMBED_CLEAR_MS);
        });
    },
    [callEmbed, livekitJsCall, nativeCall, mDirects, mx, setCallEmbed, stopOutgoingRing, store]
  );

  const callAudioAllowed = canPlayCallAudio({
    isNotificationSounds: settings.isNotificationSounds,
    callSoundOverrideGlobalNotifications: settings.callSoundOverrideGlobalNotifications,
  });
  const incomingRingtoneAllowed = settings.incomingCallSoundEnabled && callAudioAllowed;
  const outgoingRingbackAllowed =
    settings.outgoingRingbackEnabled && callAudioAllowed && settings.callRingbackTone !== 'silent';
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
      Sentry.metrics.count('sable.call.incoming.shown', 1, {
        attributes: {
          type: nextIncomingCall.notificationType,
          dm: String(nextIncomingCall.isDirect),
        },
      });
    },
    [setIncomingCall, settings.incomingVoiceRoomCallSoundEnabled]
  );

  const playIncomingRing = useCallback(() => {
    if (!incomingRingtoneAllowed || incomingToneIsSilent) {
      stopIncomingRing();
      return;
    }

    ringtoneManager
      .playIncoming()
      ?.then(() => {
        setCallSoundBlocked(false);
      })
      .catch(() => {
        // AbortError is handled in ringtoneManager, any other error comes here
        setCallSoundBlocked(true);
      });
  }, [incomingRingtoneAllowed, incomingToneIsSilent, setCallSoundBlocked, stopIncomingRing]);

  signalingHandlerRefs.current = {
    callEmbed,
    livekitJsCall,
    nativeCall,
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
      isIncomingCallSuppressed(
        incomingCall,
        mutedRoomId,
        settings.incomingVoiceRoomCallSoundEnabled
      )
    ) {
      setIncomingCall(null);
      return;
    }
    playIncomingRing();
  }, [
    incomingCall,
    mutedRoomId,
    playIncomingRing,
    setIncomingCall,
    settings.incomingVoiceRoomCallSoundEnabled,
    stopIncomingRing,
  ]);

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
        const activeCall = selectActiveCallSessionIncludingNative(
          handlers().callEmbed,
          handlers().livekitJsCall,
          handlers().nativeCall
        );
        if (type === RTC_NOTIFICATION_EVENT_TYPE && activeCall?.roomId === room.roomId) {
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
      const activeCall = selectActiveCallSessionIncludingNative(
        handlers().callEmbed,
        handlers().livekitJsCall,
        handlers().nativeCall
      );
      if (!activeCall || activeCall.roomId !== room.roomId) {
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
      getSessionMemberships: (room: Room) => mx.matrixRTC.getRoomSession(room).memberships,
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

    let outgoingRingTimeoutId: number | undefined;

    const evaluateOutgoingFallback = () => {
      const activeCallRoomId = selectActiveCallSessionIncludingNative(
        handlers().callEmbed,
        handlers().livekitJsCall,
        handlers().nativeCall
      )?.roomId;

      const stop = () => {
        handlers().stopOutgoingRing();
        window.clearTimeout(outgoingRingTimeoutId);
        outgoingRingTimeoutId = undefined;
      };

      if (
        !activeCallRoomId ||
        !handlers().outgoingRingbackAllowed ||
        declinedOutgoingRoomIdRef.current === activeCallRoomId
      ) {
        outgoingRingRoomIdRef.current = null;
        outgoingStartRef.current = null;
        return stop();
      }

      if (!handlers().mDirects.has(activeCallRoomId)) {
        return stop();
      }

      const outgoingRoom = mx.getRoom(activeCallRoomId);
      if (!outgoingRoom) {
        return stop();
      }

      const rtcSession = mx.matrixRTC.getRoomSession(outgoingRoom);

      if (isCallActive(myUserId, rtcSession.memberships)) {
        hasCallBeenActiveRef.current = true;
      }

      if (hasCallBeenActiveRef.current) {
        return stop();
      }

      const isPending = isOutgoingCallPending(myUserId, rtcSession.memberships);
      if (!isPending) {
        return stop();
      }

      if (!outgoingStartRef.current || outgoingRingRoomIdRef.current !== activeCallRoomId) {
        outgoingStartRef.current = Date.now();
        outgoingRingRoomIdRef.current = activeCallRoomId;
        debugLog.info('call', 'Outgoing ringing fallback started', { roomId: activeCallRoomId });
        ringtoneManager.playOutgoing();

        window.clearTimeout(outgoingRingTimeoutId);
        outgoingRingTimeoutId = window.setTimeout(() => {
          stop();
        }, OUTGOING_RING_TIMEOUT_MS);
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
