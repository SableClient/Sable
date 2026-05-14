import { render, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { HandleNotificationClick } from './ClientNonUIFeatures';
import { pendingNotificationAtom, activeSessionIdAtom } from '$state/sessions';
import { incomingCallAtom } from '$state/callEmbed';
import { mDirectAtom } from '$state/mDirectList';

type TestServiceWorkerContainer = EventTarget & Partial<ServiceWorkerContainer>;

describe('HandleNotificationClick', () => {
  let swContainer: TestServiceWorkerContainer;

  beforeEach(() => {
    swContainer = new EventTarget() as TestServiceWorkerContainer;
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: swContainer,
    });
  });

  it('stores pending notification and restores incoming call state from call click payload', async () => {
    const store = createStore();
    store.set(mDirectAtom, { type: 'INITIALIZE', rooms: new Set(['!dm:example.org']) });

    render(
      <Provider store={store}>
        <MemoryRouter>
          <HandleNotificationClick />
        </MemoryRouter>
      </Provider>
    );

    const now = Date.now();
    swContainer.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'notificationClick',
          userId: '@me:example.org',
          roomId: '!dm:example.org',
          eventId: '$notif',
          isCall: true,
          callNotificationType: 'ring',
          callIntentKind: 'video',
          callIntentRaw: 'start_call_dm',
          callRefEventId: '$ref',
          callSenderId: '@alice:example.org',
          callSenderTs: now,
          callExpiresAt: now + 60_000,
        },
      })
    );

    await waitFor(() => {
      expect(store.get(activeSessionIdAtom)).toBe('@me:example.org');
      expect(store.get(pendingNotificationAtom)).toEqual({
        roomId: '!dm:example.org',
        eventId: '$notif',
        targetSessionId: '@me:example.org',
      });
      expect(store.get(incomingCallAtom)).toEqual(
        expect.objectContaining({
          roomId: '!dm:example.org',
          notificationEventId: '$notif',
          refEventId: '$ref',
          senderId: '@alice:example.org',
          notificationType: 'ring',
          intentKind: 'video',
          isDirect: true,
        })
      );
    });
  });

  it('ignores expired call payloads while still navigating to the notification target', async () => {
    const store = createStore();
    store.set(mDirectAtom, { type: 'INITIALIZE', rooms: new Set(['!dm:example.org']) });

    render(
      <Provider store={store}>
        <MemoryRouter>
          <HandleNotificationClick />
        </MemoryRouter>
      </Provider>
    );

    const now = Date.now();
    swContainer.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'notificationClick',
          roomId: '!dm:example.org',
          eventId: '$notif',
          isCall: true,
          callNotificationType: 'ring',
          callSenderTs: now - 120_000,
          callExpiresAt: now - 1,
        },
      })
    );

    await waitFor(() => {
      expect(store.get(pendingNotificationAtom)).toEqual({
        roomId: '!dm:example.org',
        eventId: '$notif',
        targetSessionId: undefined,
      });
    });
    expect(store.get(incomingCallAtom)).toBeNull();
  });
});
