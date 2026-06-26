/* oxlint-disable vitest/require-mock-type-parameters */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '$types/matrix-sdk';

function makeRoom(
  roomId: string,
  loadFn: () => Promise<void> = vi.fn().mockResolvedValue(undefined)
) {
  return { roomId, loadMembersIfNeeded: loadFn } as unknown as Room;
}

describe('loadRoomMembersOnce', () => {
  // Each test gets a fresh module so the module-level loadedRoomIds / inflightPromises start empty.
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls loadMembersIfNeeded exactly once for repeated background calls', async () => {
    const { loadRoomMembersOnce } = await import('./loadRoomMembers');
    const load = vi.fn().mockResolvedValue(undefined);
    const room = makeRoom('!a:example.org', load);

    await Promise.all([loadRoomMembersOnce(room), loadRoomMembersOnce(room)]);
    await loadRoomMembersOnce(room); // already loaded — no-op

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('marks room as loaded after background call resolves', async () => {
    const { loadRoomMembersOnce, isRoomMembersLoaded } = await import('./loadRoomMembers');
    const room = makeRoom('!b:example.org');

    expect(isRoomMembersLoaded('!b:example.org')).toBe(false);
    await loadRoomMembersOnce(room);
    expect(isRoomMembersLoaded('!b:example.org')).toBe(true);
  });

  it('foreground call resolves without waiting for a queued background promise', async () => {
    const { loadRoomMembersOnce } = await import('./loadRoomMembers');

    let resolveBackground!: () => void;
    const backgroundLoad = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolveBackground = res;
        })
    );
    const foregroundLoad = vi.fn().mockResolvedValue(undefined);

    const bgRoom = makeRoom('!c:example.org', backgroundLoad);
    const fgRoom = makeRoom('!c:example.org', foregroundLoad);

    // Background load starts but stays pending.
    const bgPromise = loadRoomMembersOnce(bgRoom);

    // Foreground call must resolve immediately via its own direct load.
    await loadRoomMembersOnce(fgRoom, { foreground: true });
    expect(foregroundLoad).toHaveBeenCalledTimes(1);

    // Unblock the background callback (no-op since room is now loaded).
    resolveBackground();
    await bgPromise;
  });

  it('markRoomMembersLoaded prevents any subsequent fetch', async () => {
    const { loadRoomMembersOnce, markRoomMembersLoaded } = await import('./loadRoomMembers');
    const load = vi.fn().mockResolvedValue(undefined);
    const room = makeRoom('!d:example.org', load);

    markRoomMembersLoaded('!d:example.org');
    await loadRoomMembersOnce(room);
    await loadRoomMembersOnce(room, { foreground: true });

    expect(load).not.toHaveBeenCalled();
  });
});
