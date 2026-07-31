import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMegolmSessionData } from 'matrix-js-sdk/lib/@types/crypto';
import { handOverRoomKeys } from './migration';

const bridge = vi.hoisted(() => ({
  engineInvoke:
    vi.fn<
      (
        identity: unknown,
        method: string,
        args: { keys: string }
      ) => Promise<{ importedCount: number; totalCount: number }>
    >(),
}));

vi.mock('./olmMachine/engineInvoke', () => bridge);

const identity = { userId: '@alice:example.org', deviceId: 'NEWDEVICE' };

function session(index: number): IMegolmSessionData {
  return {
    algorithm: 'm.megolm.v1.aes-sha2',
    room_id: `!room-${index}:example.org`,
    sender_key: 'curve',
    session_id: `session-${index}`,
    session_key: 'key',
    sender_claimed_keys: { ed25519: 'ed' },
    forwarding_curve25519_key_chain: [],
  };
}

describe('handOverRoomKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.engineInvoke.mockImplementation(async (_identity, _method, { keys }) => {
      const count = (JSON.parse(keys) as unknown[]).length;
      return { importedCount: count, totalCount: count };
    });
  });

  it('hands the whole export over in one batch when it fits', async () => {
    const keys = [session(1), session(2)];
    const source = { exportRoomKeys: vi.fn<() => Promise<IMegolmSessionData[]>>(async () => keys) };

    const result = await handOverRoomKeys(source, identity);

    expect(result).toEqual({ exported: 2, imported: 2, batches: 1 });
    expect(JSON.parse(bridge.engineInvoke.mock.calls[0]![2].keys)).toEqual(keys);
  });

  it('splits a large export so no single IPC payload holds every session', async () => {
    const keys = Array.from({ length: 1200 }, (_, index) => session(index));
    const source = { exportRoomKeys: vi.fn<() => Promise<IMegolmSessionData[]>>(async () => keys) };

    const result = await handOverRoomKeys(source, identity, { batchSize: 500 });

    expect(result).toEqual({ exported: 1200, imported: 1200, batches: 3 });
    const sizes = bridge.engineInvoke.mock.calls.map(
      ([, , args]) => (JSON.parse(args.keys) as unknown[]).length
    );
    expect(sizes).toEqual([500, 500, 200]);
  });

  it('reports sessions the engine rejected as duplicates', async () => {
    bridge.engineInvoke.mockResolvedValue({ importedCount: 1, totalCount: 3 });
    const source = {
      exportRoomKeys: vi.fn<() => Promise<IMegolmSessionData[]>>(async () => [
        session(1),
        session(2),
        session(3),
      ]),
    };

    const result = await handOverRoomKeys(source, identity);

    expect(result).toEqual({ exported: 3, imported: 1, batches: 1 });
  });

  it('does no IPC at all when the old device has no keys', async () => {
    const source = { exportRoomKeys: vi.fn<() => Promise<IMegolmSessionData[]>>(async () => []) };

    const result = await handOverRoomKeys(source, identity);

    expect(result).toEqual({ exported: 0, imported: 0, batches: 0 });
    expect(bridge.engineInvoke).not.toHaveBeenCalled();
  });

  it('surfaces an export failure instead of reporting a successful handover', async () => {
    const source = {
      exportRoomKeys: vi.fn<() => Promise<IMegolmSessionData[]>>(() =>
        Promise.reject(new Error('crypto store locked'))
      ),
    };

    await expect(handOverRoomKeys(source, identity)).rejects.toThrow('crypto store locked');
    expect(bridge.engineInvoke).not.toHaveBeenCalled();
  });

  it('stops on a failed batch rather than silently dropping the rest', async () => {
    bridge.engineInvoke
      .mockResolvedValueOnce({ importedCount: 1, totalCount: 1 })
      .mockRejectedValueOnce(new Error('import failed'));
    const source = {
      exportRoomKeys: vi.fn<() => Promise<IMegolmSessionData[]>>(async () => [
        session(1),
        session(2),
      ]),
    };

    await expect(handOverRoomKeys(source, identity, { batchSize: 1 })).rejects.toThrow(
      'import failed'
    );
    expect(bridge.engineInvoke).toHaveBeenCalledTimes(2);
  });

  it('rejects a nonsensical batch size instead of looping forever', async () => {
    const source = { exportRoomKeys: vi.fn<() => Promise<IMegolmSessionData[]>>(async () => []) };

    await expect(handOverRoomKeys(source, identity, { batchSize: 0 })).rejects.toThrow(
      'at least 1'
    );
    expect(source.exportRoomKeys).not.toHaveBeenCalled();
  });
});
