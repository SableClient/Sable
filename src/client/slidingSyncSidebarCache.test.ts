import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient, MSC3575RoomData, SlidingSync } from '$types/matrix-sdk';
import { EventType, MatrixEvent, SlidingSyncEvent } from '$types/matrix-sdk';
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
      required_state: [
        stateEvent(EventType.RoomName, '', { name: 'Cached Room' }),
        stateEvent(EventType.SpaceChild, '!child:example.com', { via: ['example.com'] }),
        stateEvent(EventType.RoomMember, userId, { membership: 'join' }),
        stateEvent(EventType.RoomMember, '@other:example.com', { membership: 'join' }),
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
      })
    );
    const hydratedRoom = emitPromised.mock.calls[0]?.[2] as MSC3575RoomData;
    expect(hydratedRoom.required_state).toHaveLength(3);
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
});
