import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import * as Sentry from '@sentry/react';
import { activeSessionIdAtom, pendingNotificationAtom } from '$state/sessions';
import {
  buildNotificationBreadcrumb,
  buildNotificationMetricAttributes,
} from '$utils/notificationTelemetry';

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
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);
  const setPending = useSetAtom(pendingNotificationAtom);
  const joinCall = searchParams.get('joinCall') === 'true';
  const swClickId = searchParams.get('swClickId') ?? undefined;

  useEffect(() => {
    if (!roomId) return;
    Sentry.addBreadcrumb(
      buildNotificationBreadcrumb('restore', 'restore_route_entered', {
        click_id: swClickId,
        source: 'to_room_event',
        has_user_id: !!userId,
        has_room_id: !!roomId,
        has_event_id: !!eventId,
      })
    );
    Sentry.metrics.count('sable.notification.to_route', 1, {
      attributes: buildNotificationMetricAttributes({
        click_id: swClickId,
        source: 'to_room_event',
        has_user_id: !!userId,
        has_room_id: !!roomId,
        has_event_id: !!eventId,
      }),
    });
    // Switch to the target account first so the notification jumper navigates
    // under the correct session.
    if (userId) setActiveSessionId(userId);
    setPending({
      roomId,
      eventId,
      joinCall,
      targetSessionId: userId,
      requestedAt: Date.now(),
      swClickId,
      source: 'to_room_event',
    });
  }, [userId, roomId, eventId, joinCall, swClickId, setActiveSessionId, setPending]);

  return null;
}
