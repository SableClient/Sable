import { render, waitFor } from '@testing-library/react';
import { Provider, useAtomValue } from 'jotai';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { activeSessionIdAtom, pendingNotificationAtom } from '$state/sessions';
import { ToRoomEvent } from './ToRoomEvent';

function AtomProbe() {
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const pendingNotification = useAtomValue(pendingNotificationAtom);

  return (
    <pre data-testid="probe">
      {JSON.stringify({
        activeSessionId,
        pendingNotification,
      })}
    </pre>
  );
}

describe('ToRoomEvent', () => {
  it('captures join-call notification restore state from the route and query string', async () => {
    const { getByTestId } = render(
      <Provider>
        <MemoryRouter
          initialEntries={[
            '/to/%40alice%3Aexample/!room%3Aexample/%24event123?joinCall=true&swClickId=notification-click-123&jumpMode=notification_live',
          ]}
        >
          <Routes>
            <Route
              path="/to/:user_id/:room_id/:event_id?"
              element={
                <>
                  <ToRoomEvent />
                  <AtomProbe />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      const payload = JSON.parse(getByTestId('probe').textContent ?? '{}') as {
        activeSessionId?: string;
        pendingNotification?: {
          roomId?: string;
          eventId?: string;
          jumpMode?: string;
          joinCall?: boolean;
          targetSessionId?: string;
          requestedAt?: number;
          source?: string;
          swClickId?: string;
        };
      };

      expect(payload.activeSessionId).toBe('@alice:example');
      expect(payload.pendingNotification?.roomId).toBe('!room:example');
      expect(payload.pendingNotification?.eventId).toBe('$event123');
      expect(payload.pendingNotification?.jumpMode).toBe('notification_live');
      expect(payload.pendingNotification?.joinCall).toBe(true);
      expect(payload.pendingNotification?.targetSessionId).toBe('@alice:example');
      expect(payload.pendingNotification?.source).toBe('to_room_event');
      expect(payload.pendingNotification?.swClickId).toBe('notification-click-123');
      expect(typeof payload.pendingNotification?.requestedAt).toBe('number');
    });
  });

  it('defaults non-notification deep links to history_context', async () => {
    const { getByTestId } = render(
      <Provider>
        <MemoryRouter initialEntries={['/to/%40alice%3Aexample/!room%3Aexample/%24event123']}>
          <Routes>
            <Route
              path="/to/:user_id/:room_id/:event_id?"
              element={
                <>
                  <ToRoomEvent />
                  <AtomProbe />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      const payload = JSON.parse(getByTestId('probe').textContent ?? '{}') as {
        pendingNotification?: {
          jumpMode?: string;
        };
      };

      expect(payload.pendingNotification?.jumpMode).toBe('history_context');
    });
  });
});
