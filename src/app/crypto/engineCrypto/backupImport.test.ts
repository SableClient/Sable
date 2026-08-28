import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportRoomKeyStage, type MatrixClient } from '$types/matrix-sdk';
import type { IMegolmSessionData } from 'matrix-js-sdk/lib/@types/crypto';
import { engineInvoke } from '../olmMachine/engineInvoke';
import { EngineCrypto } from './EngineCrypto';

vi.mock('../olmMachine/engineInvoke', () => ({
  engineInvoke: vi.fn<(...args: never[]) => Promise<unknown>>(async () => ({
    importedCount: 0,
    totalCount: 0,
  })),
}));

const mockInvoke = vi.mocked(engineInvoke);

const crypto = () =>
  new EngineCrypto({} as MatrixClient, { userId: '@me:example.org', deviceId: 'DEVICE' });

const session = (id: string) => ({ session_id: id }) as IMegolmSessionData;

describe('importBackedUpRoomKeys', () => {
  beforeEach(() => mockInvoke.mockClear());

  it('passes the backup version through alongside the keys', async () => {
    await crypto().importBackedUpRoomKeys([session('a'), session('b')], '7');

    const [, method, args] = mockInvoke.mock.calls[0] as [
      unknown,
      string,
      { backupVersion: string; keys: string },
    ];
    expect(method).toBe('importBackedUpRoomKeys');
    expect(args.backupVersion).toBe('7');
    expect(JSON.parse(args.keys)).toHaveLength(2);
  });

  it('reports the counts the engine actually imported, not the counts requested', async () => {
    mockInvoke.mockResolvedValueOnce({ importedCount: 1, totalCount: 2 });
    const progressCallback = vi.fn<(stage: unknown) => void>();

    await crypto().importBackedUpRoomKeys([session('a'), session('b')], '7', { progressCallback });

    expect(progressCallback).toHaveBeenCalledWith({
      stage: ImportRoomKeyStage.LoadKeys,
      successes: 1,
      failures: 1,
      total: 2,
    });
  });

  it('falls back to the requested count when the engine reports nothing', async () => {
    mockInvoke.mockResolvedValueOnce(null);
    const progressCallback = vi.fn<(stage: unknown) => void>();

    await crypto().importBackedUpRoomKeys([session('a')], '7', { progressCallback });

    expect(progressCallback).toHaveBeenCalledWith(
      expect.objectContaining({ successes: 0, failures: 1, total: 1 })
    );
  });
});
