import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { activeSessionIdAtom, pendingNotificationAtom } from '$state/sessions';
import { mDirectAtom } from '$state/mDirectList';
import { incomingCallAtom, mutedCallRoomIdAtom } from '$state/callEmbed';
import { resolveIncomingCallFromSearchParams } from '$features/call/callNotificationBridge';
import { isIncomingCallSuppressed } from '$features/call/callIncomingIngress';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';

// ToRoomEvent handles /to/:user_id/:room_id/:event_id? — the canonical deep-link
// URL used by the service worker's notificationclick handler.
//
// The :user_id segment lets the SW embed the target Matrix user ID directly in
// the URL (e.g. %40alice%3Aserver.tld) so the correct account is always
// activated before navigation, even on a cold launch where the app restarts
// from scratch after the PWA was killed by the OS.
//
// This component does NOT navigate itself — it writes to pendingNotificationAtom
// so NotificationJumper can navigate once the Matrix client has finished its
// initial sync. The atom survives the ClientRoot reload that happens when
// setActiveSessionId() triggers an account switch.
export function ToRoomEvent() {
  const { user_id: userId, room_id: roomId, event_id: eventId } = useParams();
  const [searchParams] = useSearchParams();
  const mDirects = useAtomValue(mDirectAtom);
  const mutedRoomId = useAtomValue(mutedCallRoomIdAtom);
  const [incomingVoiceRoomCallSoundEnabled] = useSetting(
    settingsAtom,
    'incomingVoiceRoomCallSoundEnabled'
  );
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);
  const setPending = useSetAtom(pendingNotificationAtom);
  const setIncomingCall = useSetAtom(incomingCallAtom);

  useEffect(() => {
    if (!roomId) return;
    // Switch to the target account first so the notification jumper navigates
    // under the correct session.
    if (userId) setActiveSessionId(userId);
    setPending({ roomId, eventId, targetSessionId: userId });

    const incomingCall = resolveIncomingCallFromSearchParams(
      searchParams,
      roomId,
      eventId,
      mDirects.has(roomId)
    );
    if (
      incomingCall &&
      !isIncomingCallSuppressed(incomingCall, mutedRoomId, incomingVoiceRoomCallSoundEnabled)
    ) {
      setIncomingCall(incomingCall);
    }

    // Replace /to/… in history so the back button doesn't return to this route.
    window.history.replaceState({}, '', '/');
  }, [
    eventId,
    mDirects,
    mutedRoomId,
    roomId,
    searchParams,
    setActiveSessionId,
    setIncomingCall,
    setPending,
    userId,
    incomingVoiceRoomCallSoundEnabled,
  ]);

  return null;
}
