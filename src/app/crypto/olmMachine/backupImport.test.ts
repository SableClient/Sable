import { describe, expect, it, vi } from 'vitest';
import { OlmMachineProxy } from './proxy';
import { engineInvoke } from './engineInvoke';

vi.mock('./engineInvoke', () => ({
  engineInvoke: vi.fn<(...args: never[]) => Promise<unknown>>(async () => ({
    importedCount: 0,
    totalCount: 0,
  })),
}));
vi.mock('$generated/tauri/commands', () => ({ engineClose: vi.fn<() => Promise<void>>() }));

const mockInvoke = vi.mocked(engineInvoke);

const proxy = () =>
  new OlmMachineProxy({
    userId: '@me:example.org',
    deviceId: 'DEVICE',
    ed25519Key: 'ed',
    curve25519Key: 'curve',
    deviceCreationTimeMs: 0,
  });

const roomId = (id: string) => ({ toString: () => id });

describe('importBackedUpRoomKeys', () => {
  it('keeps every session when one room arrives as several map entries', async () => {
    mockInvoke.mockClear();
    const keysByRoom = new Map([
      [roomId('!room:example.org'), new Map([['session-a', { session_id: 'session-a' }]])],
      [roomId('!room:example.org'), new Map([['session-b', { session_id: 'session-b' }]])],
      [roomId('!other:example.org'), new Map([['session-c', { session_id: 'session-c' }]])],
    ]);

    await proxy().importBackedUpRoomKeys(keysByRoom, undefined, '7');

    const args = mockInvoke.mock.calls[0]?.[2] as {
      keys: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(args.keys['!room:example.org'] ?? {})).toEqual(['session-a', 'session-b']);
    expect(Object.keys(args.keys['!other:example.org'] ?? {})).toEqual(['session-c']);
  });

  it('passes the backup version through, not the progress listener', async () => {
    mockInvoke.mockClear();
    const listener = vi.fn<(a: bigint, b: bigint, c: bigint) => void>();

    await proxy().importBackedUpRoomKeys(new Map(), listener, '7');

    const args = mockInvoke.mock.calls[0]?.[2] as { backupVersion: unknown };
    expect(args.backupVersion).toBe('7');
    expect(listener).toHaveBeenCalled();
  });
});
