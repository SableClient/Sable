import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { EventEmitter } from 'events';
import { Provider as JotaiProvider, createStore } from 'jotai';
import type { PropsWithChildren } from 'react';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { EventType, RoomStateEvent } from '$types/matrix-sdk';
import { mDirectAtom } from '$state/mDirectList';
import { MatrixClientProvider } from './useMatrixClient';
import { useRoomAvatar, useRoomName } from './useRoomMeta';

const AVATAR_MXC = 'mxc://server/abc';

const makeAvatarEvent = (roomId: string, url: string): MatrixEvent =>
  ({
    getRoomId: () => roomId,
    getType: () => 'm.room.avatar',
    getStateKey: () => '',
    getContent: () => ({ url }),
  }) as unknown as MatrixEvent;

const makeRoom = (roomId: string) => {
  const client = new EventEmitter();
  let avatarEvent: MatrixEvent | undefined;
  const room = {
    roomId,
    client,
    getLiveTimeline: () => ({
      getState: () => ({ getStateEvents: () => avatarEvent }),
    }),
  } as unknown as Room;
  return {
    room,
    client,
    wrapper: ({ children }: PropsWithChildren) => (
      <MatrixClientProvider value={client as unknown as MatrixClient}>
        {children}
      </MatrixClientProvider>
    ),
    setAvatarEvent: (event: MatrixEvent) => {
      avatarEvent = event;
    },
  };
};

describe('useRoomAvatar', () => {
  it('returns undefined when no avatar state is loaded', () => {
    const { room, wrapper } = makeRoom('!space:server');
    const { result } = renderHook(() => useRoomAvatar(room), { wrapper });
    expect(result.current).toBeUndefined();
  });

  it('updates when the avatar state event arrives after mount', () => {
    const { room, client, setAvatarEvent, wrapper } = makeRoom('!space:server');
    const { result } = renderHook(() => useRoomAvatar(room), { wrapper });
    expect(result.current).toBeUndefined();

    const avatarEvent = makeAvatarEvent('!space:server', AVATAR_MXC);
    setAvatarEvent(avatarEvent);
    act(() => {
      client.emit(RoomStateEvent.Events, avatarEvent);
    });

    expect(result.current).toBe(AVATAR_MXC);
  });

  it('ignores avatar state events from other rooms', () => {
    const { room, client, wrapper } = makeRoom('!space:server');
    const { result } = renderHook(() => useRoomAvatar(room), { wrapper });

    act(() => {
      client.emit(RoomStateEvent.Events, makeAvatarEvent('!other:server', AVATAR_MXC));
    });

    expect(result.current).toBeUndefined();
  });

  it('updates a DM avatar when its member state arrives after the sidebar rendered', () => {
    const { room, wrapper } = makeRoom('!dm:server');
    const roomEvents = new EventEmitter();
    let fallbackMember: { getMxcAvatarUrl: () => string } | undefined;
    Object.assign(room, {
      getAvatarFallbackMember: () => fallbackMember,
      on: roomEvents.on.bind(roomEvents),
      removeListener: roomEvents.removeListener.bind(roomEvents),
    });

    const { result } = renderHook(() => useRoomAvatar(room, true), { wrapper });
    expect(result.current).toBeUndefined();

    fallbackMember = { getMxcAvatarUrl: () => AVATAR_MXC };
    act(() => {
      roomEvents.emit(RoomStateEvent.Members);
    });

    expect(result.current).toBe(AVATAR_MXC);
  });
});

const makeNameRoom = (
  roomId: string,
  {
    mDirects = {},
    members = {},
    fallbackMember,
    functionalMemberIds = [],
    name = 'Room',
    nameEventId,
  }: {
    mDirects?: Record<string, string[]>;
    members?: Record<string, { rawDisplayName?: string; membership?: string }>;
    fallbackMember?: { userId: string; rawDisplayName?: string; membership?: string };
    functionalMemberIds?: string[];
    name?: string;
    nameEventId?: string;
  }
) => {
  const client = new EventEmitter();
  const stateEvents: Record<string, MatrixEvent | undefined> = {
    [EventType.RoomName]: nameEventId
      ? ({
          getId: () => nameEventId,
          getContent: () => ({ name }),
        } as unknown as MatrixEvent)
      : undefined,
    'io.element.functional_members': functionalMemberIds.length
      ? ({ getContent: () => ({ service_members: functionalMemberIds }) } as unknown as MatrixEvent)
      : undefined,
  };
  const room = {
    roomId,
    client,
    name,
    guessDMUserId: () => '',
    recalculate: () => {},
    getLiveTimeline: () => ({
      getState: () => ({ getStateEvents: (type: string) => stateEvents[type] }),
    }),
    getMember: (userId: string) => members[userId],
    getMembers: () => [{ userId: '@me:server', membership: 'join' }, ...Object.values(members)],
    getAvatarFallbackMember: () => fallbackMember,
    on: client.on.bind(client),
    removeListener: client.removeListener.bind(client),
  } as unknown as Room;
  Object.assign(client, {
    getAccountData: () => ({ getContent: () => mDirects }),
    getUserId: () => '@me:server',
  });

  const store = createStore();
  store.set(mDirectAtom, { type: 'INITIALIZE', rooms: new Set(Object.values(mDirects).flat()) });

  const wrapper = ({ children }: PropsWithChildren) => (
    <JotaiProvider store={store}>
      <MatrixClientProvider value={client as unknown as MatrixClient}>
        {children}
      </MatrixClientProvider>
    </JotaiProvider>
  );
  return { room, client, wrapper };
};

describe('useRoomName', () => {
  const fakeNameEventId = '$fake-sliding-sync-name-event-!dm:server';

  it('prefers the counterpart over the sliding-sync server name for a bridged DM', () => {
    const { room, wrapper } = makeNameRoom('!dm:server', {
      mDirects: { '@alice:server': ['!dm:server'] },
      members: {
        '@alice:server': { rawDisplayName: 'Alexia', membership: 'join' },
        '@signal-service:server': { membership: 'join' },
      },
      functionalMemberIds: ['@signal-service:server'],
      name: 'Alexia, Signal Bridge bot',
      nameEventId: fakeNameEventId,
    });

    const { result } = renderHook(() => useRoomName(room), { wrapper });

    expect(result.current).toBe('Alexia');
  });

  it('falls back to the hero member name when sliding sync has no member state', () => {
    const { room, wrapper } = makeNameRoom('!dm:server', {
      mDirects: { '@alice:server': ['!dm:server'] },
      functionalMemberIds: ['@signal-service:server'],
      fallbackMember: { userId: '@alice:server', rawDisplayName: 'Alexia', membership: 'join' },
      name: 'Alexia, Signal Bridge bot',
      nameEventId: fakeNameEventId,
    });

    const { result } = renderHook(() => useRoomName(room), { wrapper });

    expect(result.current).toBe('Alexia');
  });

  it('keeps a genuine m.room.name on a DM', () => {
    const { room, wrapper } = makeNameRoom('!dm:server', {
      mDirects: { '@alice:server': ['!dm:server'] },
      members: {
        '@alice:server': { rawDisplayName: 'Alexia', membership: 'join' },
      },
      name: 'Movie Club',
      nameEventId: '$real-name-event:server',
    });

    const { result } = renderHook(() => useRoomName(room), { wrapper });

    expect(result.current).toBe('Movie Club');
  });

  it('keeps the sliding-sync server name for non-DM rooms', () => {
    const { room, wrapper } = makeNameRoom('!room:server', {
      name: 'Bridge Lobby',
      nameEventId: '$fake-sliding-sync-name-event-!room:server',
    });

    const { result } = renderHook(() => useRoomName(room), { wrapper });

    expect(result.current).toBe('Bridge Lobby');
  });
});
