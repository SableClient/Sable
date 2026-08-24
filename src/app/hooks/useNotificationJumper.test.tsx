import { act, render, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import type * as ReactRouterDom from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientEvent, SyncState } from '$types/matrix-sdk';
import { activeSessionIdAtom, pendingNotificationAtom } from '$state/sessions';
import { mDirectAtom } from '$state/mDirectList';
import { roomToParentsAtom } from '$state/room/roomToParents';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn<() => void>(),
  getSlidingSyncManager: vi.fn<() => unknown>(),
  mx: undefined as unknown,
}));

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouterDom>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock('$client/initMatrix', () => ({
  getSlidingSyncManager: mocks.getSlidingSyncManager,
}));

vi.mock('./useMatrixClient', () => ({
  useMatrixClient: () => mocks.mx,
}));

vi.mock('./useSyncState', () => ({
  useSyncState: () => {},
}));

import { NotificationJumper } from './useNotificationJumper';

const renderJumper = (initialTimeline?: 'live' | 'detached') => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const liveTimeline = {
    getNeighbouringTimeline: () => null,
    getState: () => undefined,
  };
  const detachedTimeline = {
    getNeighbouringTimeline: () => null,
  };
  let targetTimeline =
    initialTimeline === 'live'
      ? liveTimeline
      : initialTimeline === 'detached'
        ? detachedTimeline
        : undefined;
  const timelineSet = {
    getLiveTimeline: () => liveTimeline,
    getTimelineForEvent: () => targetTimeline,
  };
  const room = {
    roomId: '!room:example.org',
    getMyMembership: () => 'join',
    getCanonicalAlias: () => null,
    getLiveTimeline: () => liveTimeline,
    getUnfilteredTimelineSet: () => timelineSet,
  };
  mocks.mx = {
    getUserId: () => '@me:example.org',
    getSyncState: () => SyncState.Syncing,
    getRoom: () => room,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    },
    removeListener: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(listener);
    },
  };

  const store = createStore();
  store.set(activeSessionIdAtom, '@me:example.org');
  store.set(mDirectAtom, { type: 'INITIALIZE', rooms: new Set([room.roomId]) });
  store.set(roomToParentsAtom, { type: 'INITIALIZE', roomToParents: new Map() });
  store.set(pendingNotificationAtom, {
    roomId: room.roomId,
    eventId: '$target',
    targetSessionId: '@me:example.org',
  });

  const rendered = render(
    <Provider store={store}>
      <NotificationJumper />
    </Provider>
  );

  return {
    loadTarget: () => {
      targetTimeline = liveTimeline;
    },
    emitRoom: () => {
      listeners.get(ClientEvent.Room)?.forEach((listener) => listener());
    },
    emitSync: () => {
      listeners
        .get(ClientEvent.Sync)
        ?.forEach((listener) => listener(SyncState.Syncing, SyncState.Syncing));
    },
    store,
    unmount: rendered.unmount,
  };
};

describe('NotificationJumper', () => {
  const subscriptionCallbacks = new Map<string, () => void>();
  const prepareRoomSubscription = vi.fn<(_roomId: string, listener: () => void) => () => void>(
    (roomId, listener) => {
      subscriptionCallbacks.set(roomId, listener);
      return () => subscriptionCallbacks.delete(roomId);
    }
  );
  const unsubscribeFromRoom = vi.fn<() => void>();
  const releaseRoomSubscriptionUnlessRouted = vi.fn<() => void>();

  beforeEach(() => {
    mocks.navigate.mockReset();
    prepareRoomSubscription.mockClear();
    unsubscribeFromRoom.mockClear();
    releaseRoomSubscriptionUnlessRouted.mockClear();
    mocks.getSlidingSyncManager.mockReset().mockReturnValue({
      isRoomActive: () => false,
      isRoomSubscriptionTemporary: () => true,
      prepareRoomSubscription,
      releaseRoomSubscriptionUnlessRouted,
      unsubscribeFromRoom,
    });
    subscriptionCallbacks.clear();
  });

  it('preloads the room and waits for that subscription response before navigating', async () => {
    const jumper = renderJumper();

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(prepareRoomSubscription).toHaveBeenCalledWith('!room:example.org', expect.any(Function));

    jumper.loadTarget();
    jumper.emitRoom();
    expect(mocks.navigate).not.toHaveBeenCalled();

    subscriptionCallbacks.get('!room:example.org')?.();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledOnce());
    expect(unsubscribeFromRoom).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(releaseRoomSubscriptionUnlessRouted).toHaveBeenCalledWith('!room:example.org')
    );
  });

  it('jumps anyway when the subscription is never confirmed', async () => {
    vi.useFakeTimers();
    try {
      const jumper = renderJumper();
      jumper.loadTarget();
      jumper.emitRoom();
      expect(mocks.navigate).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });

      expect(mocks.navigate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to context after the subscription response omits the target', async () => {
    renderJumper();
    expect(mocks.navigate).not.toHaveBeenCalled();

    subscriptionCallbacks.get('!room:example.org')?.();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledOnce());
  });

  it('releases the temporary subscription when navigation fails', async () => {
    mocks.navigate.mockImplementationOnce(() => {
      throw new Error('navigation failed');
    });
    renderJumper();

    expect(() => subscriptionCallbacks.get('!room:example.org')?.()).not.toThrow();

    await waitFor(() => expect(unsubscribeFromRoom).toHaveBeenCalledWith('!room:example.org'));
    expect(releaseRoomSubscriptionUnlessRouted).not.toHaveBeenCalled();
  });

  it('preloads an inactive room even when the notification event is already live', async () => {
    renderJumper('live');

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(prepareRoomSubscription).toHaveBeenCalledWith('!room:example.org', expect.any(Function));

    subscriptionCallbacks.get('!room:example.org')?.();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledOnce());
  });

  it('preloads a subscription for a target held in a detached timeline', () => {
    renderJumper('detached');

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(prepareRoomSubscription).toHaveBeenCalledOnce();
  });

  it('waits for a completed legacy sync before falling back to context', async () => {
    mocks.getSlidingSyncManager.mockReturnValue(undefined);
    const jumper = renderJumper();

    expect(mocks.navigate).not.toHaveBeenCalled();
    jumper.loadTarget();
    jumper.emitRoom();
    expect(mocks.navigate).not.toHaveBeenCalled();

    jumper.emitSync();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledOnce());
  });

  it('cancels a superseded room subscription and only performs the latest jump', async () => {
    const jumper = renderJumper();

    act(() => {
      jumper.store.set(pendingNotificationAtom, {
        roomId: '!other:example.org',
        eventId: '$other',
        targetSessionId: '@me:example.org',
      });
    });

    expect(subscriptionCallbacks.has('!room:example.org')).toBe(false);
    expect(unsubscribeFromRoom).toHaveBeenCalledWith('!room:example.org');
    expect(prepareRoomSubscription).toHaveBeenLastCalledWith(
      '!other:example.org',
      expect.any(Function)
    );

    subscriptionCallbacks.get('!other:example.org')?.();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledOnce());
    expect(mocks.navigate).toHaveBeenCalledWith('/home/!other%3Aexample.org/%24other');
  });
});
