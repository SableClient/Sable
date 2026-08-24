import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient, MSC3575RoomData, SlidingSync } from '$types/matrix-sdk';
import {
  EventType,
  MatrixEvent,
  SlidingSyncEvent,
  UNSTABLE_ELEMENT_FUNCTIONAL_USERS,
} from '$types/matrix-sdk';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import { SlidingSyncSidebarCache } from './slidingSyncSidebarCache';

const userId = '@user:example.com';

const stateEvent = (type: string, stateKey: string, content: Record<string, unknown> = {}) => ({
  type,
  state_key: stateKey,
  content,
  event_id: `$${type}-${stateKey}`,
  sender: userId,
  origin_server_ts: 1,
});

const hydrateRoom = async (roomId: string): Promise<MSC3575RoomData> => {
  const emitPromised = vi
    .fn<(event: SlidingSyncEvent, roomId: string, data: MSC3575RoomData) => Promise<boolean>>()
    .mockResolvedValue(true);
  const restored = new SlidingSyncSidebarCache(userId);
  await restored.hydrate(
    {
      store: { storeAccountDataEvents: vi.fn<(events: MatrixEvent[]) => void>() },
    } as unknown as MatrixClient,
    { emitPromised } as unknown as SlidingSync
  );
  const call = emitPromised.mock.calls.find(([, id]) => id === roomId);
  return call?.[2] as MSC3575RoomData;
};

beforeEach(() => {
  localStorage.clear();
});

describe('SlidingSyncSidebarCache', () => {
  it('restores sidebar state without caching timelines or bulk members', async () => {
    const cache = new SlidingSyncSidebarCache(userId);
    cache.cacheRoom('!room:example.com', {
      name: 'Cached Room',
      initial: true,
      bump_stamp: 42,
      notification_count: 3,
      highlight_count: 1,
      required_state: [
        stateEvent(EventType.RoomName, '', { name: 'Cached Room' }),
        stateEvent(EventType.SpaceChild, '!child:example.com', { via: ['example.com'] }),
        stateEvent(EventType.RoomMember, userId, { membership: 'join' }),
        stateEvent(EventType.RoomMember, '@other:example.com', { membership: 'join' }),
        stateEvent(UNSTABLE_ELEMENT_FUNCTIONAL_USERS.name, '', {
          service_members: ['@bridgebot:example.com'],
        }),
      ],
      timeline: [
        {
          type: EventType.RoomMessage,
          content: { body: 'do not cache me' },
          event_id: '$message',
          sender: '@other:example.com',
          origin_server_ts: 2,
        },
      ],
    } as MSC3575RoomData);
    cache.cacheAccountData(
      new MatrixEvent({ type: EventType.Direct, content: { '@other:example.com': ['!room'] } })
    );
    cache.cacheAccountData(
      new MatrixEvent({
        type: CustomAccountDataEvent.CinnySpaces,
        content: { categories: ['!room:example.com'] },
      })
    );
    cache.dispose();

    const emitPromised = vi
      .fn<(event: SlidingSyncEvent, roomId: string, data: MSC3575RoomData) => Promise<boolean>>()
      .mockResolvedValue(true);
    const storeAccountDataEvents = vi.fn<(events: MatrixEvent[]) => void>();
    const restored = new SlidingSyncSidebarCache(userId);
    const hydrated = await restored.hydrate(
      { store: { storeAccountDataEvents } } as unknown as MatrixClient,
      { emitPromised } as unknown as SlidingSync
    );

    expect(hydrated).toBe(true);
    expect(emitPromised).toHaveBeenCalledWith(
      SlidingSyncEvent.RoomData,
      '!room:example.com',
      expect.objectContaining({
        name: 'Cached Room',
        timeline: [],
        initial: true,
        bump_stamp: 42,
        notification_count: 3,
        highlight_count: 1,
      })
    );
    const hydratedRoom = emitPromised.mock.calls[0]?.[2] as MSC3575RoomData;
    expect(hydratedRoom.required_state).toHaveLength(4);
    expect(hydratedRoom.required_state).toContainEqual(
      expect.objectContaining({
        type: UNSTABLE_ELEMENT_FUNCTIONAL_USERS.name,
        state_key: '',
      })
    );
    expect(hydratedRoom.required_state).toContainEqual(
      expect.objectContaining({
        type: EventType.SpaceChild,
        state_key: '!child:example.com',
      })
    );
    expect(hydratedRoom.required_state).not.toContainEqual(
      expect.objectContaining({ state_key: '@other:example.com' })
    );
    expect(storeAccountDataEvents).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ event: expect.objectContaining({ type: EventType.Direct }) }),
        expect.objectContaining({
          event: expect.objectContaining({ type: CustomAccountDataEvent.CinnySpaces }),
        }),
      ])
    );
  });

  it('merges later state into the existing cached room snapshot', async () => {
    const cache = new SlidingSyncSidebarCache(userId);
    cache.cacheRoom('!room:example.com', {
      name: 'Before',
      required_state: [stateEvent(EventType.RoomName, '', { name: 'Before' })],
      timeline: [],
    });
    cache.cacheRoom('!room:example.com', {
      name: 'After',
      required_state: [stateEvent(EventType.RoomAvatar, '', { url: 'mxc://example/avatar' })],
      timeline: [],
    });
    cache.dispose();

    const emitPromised = vi
      .fn<(event: SlidingSyncEvent, roomId: string, data: MSC3575RoomData) => Promise<boolean>>()
      .mockResolvedValue(true);
    const restored = new SlidingSyncSidebarCache(userId);
    await restored.hydrate(
      {
        store: { storeAccountDataEvents: vi.fn<(events: MatrixEvent[]) => void>() },
      } as unknown as MatrixClient,
      { emitPromised } as unknown as SlidingSync
    );

    const hydratedRoom = emitPromised.mock.calls[0]?.[2] as MSC3575RoomData;
    expect(hydratedRoom.name).toBe('After');
    expect(hydratedRoom.required_state).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: EventType.RoomName }),
        expect.objectContaining({ type: EventType.RoomAvatar }),
      ])
    );
  });

  it('drops invite_state once required_state shows the user joined', async () => {
    // A server (e.g. Continuwuity) keeps sending invite_state after a join.
    const cache = new SlidingSyncSidebarCache(userId);
    cache.cacheRoom('!room:example.com', {
      required_state: [stateEvent(EventType.RoomMember, userId, { membership: 'join' })],
      invite_state: [stateEvent(EventType.RoomMember, userId, { membership: 'invite' })],
      timeline: [],
    } as unknown as MSC3575RoomData);
    cache.dispose();

    const hydratedRoom = await hydrateRoom('!room:example.com');
    expect(hydratedRoom.invite_state).toBeUndefined();
  });

  it('keeps invite_state for a genuine pending invite', async () => {
    const cache = new SlidingSyncSidebarCache(userId);
    cache.cacheRoom('!invite:example.com', {
      required_state: [stateEvent(EventType.RoomMember, userId, { membership: 'invite' })],
      invite_state: [stateEvent(EventType.RoomMember, userId, { membership: 'invite' })],
      timeline: [],
    } as unknown as MSC3575RoomData);
    // A later partial update without invite_state must not drop the invite.
    cache.cacheRoom('!invite:example.com', {
      required_state: [],
      timeline: [],
    } as unknown as MSC3575RoomData);
    cache.dispose();

    const hydratedRoom = await hydrateRoom('!invite:example.com');
    expect(hydratedRoom.invite_state).toContainEqual(
      expect.objectContaining({ type: EventType.RoomMember, state_key: userId })
    );
  });

  it('heals a cached invite_state on hydrate when required_state shows join', async () => {
    // Simulate a cache corrupted by an older build: persist invite_state
    // alongside a join membership by writing storage directly.
    const key = `sable.slidingSyncSidebarCache.${encodeURIComponent(userId)}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        accountData: {},
        rooms: {
          '!room:example.com': {
            name: 'Space',
            required_state: [stateEvent(EventType.RoomMember, userId, { membership: 'join' })],
            invite_state: [stateEvent(EventType.RoomMember, userId, { membership: 'invite' })],
            timeline: [],
          },
        },
      })
    );

    const hydratedRoom = await hydrateRoom('!room:example.com');
    expect(hydratedRoom.invite_state).toBeUndefined();
  });

  it('clears invite_state for rooms confirmed joined via the authoritative backstop', async () => {
    const cache = new SlidingSyncSidebarCache(userId);
    // required_state still shows invite (e.g. joined on another client), so the
    // required_state healing cannot catch it; the joined-rooms backstop does.
    cache.cacheRoom('!room:example.com', {
      required_state: [stateEvent(EventType.RoomMember, userId, { membership: 'invite' })],
      invite_state: [stateEvent(EventType.RoomMember, userId, { membership: 'invite' })],
      timeline: [],
    } as unknown as MSC3575RoomData);
    cache.clearInviteStateForRooms(['!room:example.com']);
    cache.dispose();

    const hydratedRoom = await hydrateRoom('!room:example.com');
    expect(hydratedRoom.invite_state).toBeUndefined();
  });
});
