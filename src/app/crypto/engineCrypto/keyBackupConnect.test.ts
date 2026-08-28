import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { engineInvoke } from '../olmMachine/engineInvoke';
import { EngineCrypto } from './EngineCrypto';

vi.mock('../olmMachine/engineInvoke', () => ({
  engineInvoke: vi.fn<(...args: never[]) => Promise<unknown>>(),
}));

const mockInvoke = vi.mocked(engineInvoke);

const BACKUP_INFO = {
  version: '7',
  algorithm: 'm.megolm_backup.v1.curve25519-aes-sha2',
  auth_data: { public_key: 'cHVibGlj' },
};

const clientSpy = () => {
  const authedRequest = vi.fn<(...args: never[]) => Promise<unknown>>(async () => BACKUP_INFO);
  return { mx: { http: { authedRequest } } as unknown as MatrixClient, authedRequest };
};

const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Nothing else calls checkKeyBackupAndEnable, so without this the engine never runs
 * enableBackupV1 and the backup reads as disconnected on a fully verified device.
 */
describe('key backup connection', () => {
  beforeEach(() => mockInvoke.mockReset());

  it('enables a trusted backup on construction', async () => {
    const { mx } = clientSpy();
    mockInvoke.mockImplementation(async (_identity, method) => {
      if (method === 'verifyBackup') return { trusted: true };
      if (method === 'getBackupKeys') return { backupVersion: null, decryptionKeyBase64: null };
      return null;
    });

    const crypto = new EngineCrypto(mx, { userId: '@me:e.org', deviceId: 'D' });
    expect(crypto).toBeDefined();
    await settle();

    const enabled = mockInvoke.mock.calls.filter(([, method]) => method === 'enableBackupV1');
    expect(enabled).toHaveLength(1);
    expect(enabled[0]?.[2]).toMatchObject({ publicKeyBase64: 'cHVibGlj', version: '7' });
  });

  it('leaves an untrusted backup alone', async () => {
    const { mx } = clientSpy();
    mockInvoke.mockImplementation(async (_identity, method) => {
      if (method === 'verifyBackup') return { trusted: false };
      if (method === 'getBackupKeys') return { backupVersion: null, decryptionKeyBase64: null };
      return null;
    });

    const crypto = new EngineCrypto(mx, { userId: '@me:e.org', deviceId: 'D' });
    expect(crypto).toBeDefined();
    await settle();

    expect(mockInvoke.mock.calls.some(([, method]) => method === 'enableBackupV1')).toBe(false);
  });

  it('retries once our own identity becomes trusted', async () => {
    const { mx } = clientSpy();
    mockInvoke.mockImplementation(async (_identity, method) => {
      if (method === 'verifyBackup') return { trusted: true };
      if (method === 'getBackupKeys') return { backupVersion: null, decryptionKeyBase64: null };
      return null;
    });

    const crypto = new EngineCrypto(mx, { userId: '@me:e.org', deviceId: 'D' });
    await settle();
    crypto.onUserIdentityUpdated('@me:e.org');
    await settle();

    expect(mockInvoke.mock.calls.filter(([, method]) => method === 'enableBackupV1')).toHaveLength(
      2
    );
  });

  it('ignores another user becoming trusted', async () => {
    const { mx } = clientSpy();
    mockInvoke.mockImplementation(async (_identity, method) => {
      if (method === 'verifyBackup') return { trusted: true };
      if (method === 'getBackupKeys') return { backupVersion: null, decryptionKeyBase64: null };
      return null;
    });

    const crypto = new EngineCrypto(mx, { userId: '@me:e.org', deviceId: 'D' });
    await settle();
    crypto.onUserIdentityUpdated('@them:e.org');
    await settle();

    expect(mockInvoke.mock.calls.filter(([, method]) => method === 'enableBackupV1')).toHaveLength(
      1
    );
  });
});
