import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrossSigningKey, type MatrixClient } from '$types/matrix-sdk';
import { engineInvoke } from '../olmMachine/engineInvoke';
import { EngineCrypto } from './EngineCrypto';

vi.mock('../olmMachine/engineInvoke', () => ({
  engineInvoke: vi.fn<(...args: never[]) => Promise<unknown>>(),
}));

const mockInvoke = vi.mocked(engineInvoke);

const crypto = () =>
  new EngineCrypto({} as MatrixClient, { userId: '@me:example.org', deviceId: 'DEVICE' });

/** Mirrors the exact JSON the Rust side emits; a rename there breaks these loudly. */
describe('engine payload shapes', () => {
  beforeEach(() => mockInvoke.mockReset());

  it('reads the backup key from decryptionKeyBase64, not decryptionKey', async () => {
    mockInvoke.mockResolvedValue({
      className: 'BackupKeys',
      backupVersion: '7',
      decryptionKeyBase64: 'AAAA',
    });

    await expect(crypto().getSessionBackupPrivateKey()).resolves.not.toBeNull();
    await expect(crypto().getActiveSessionBackupVersion()).resolves.toBe('7');
  });

  it('returns null when the engine holds no backup key', async () => {
    mockInvoke.mockResolvedValue({ className: 'BackupKeys', backupVersion: null });

    await expect(crypto().getSessionBackupPrivateKey()).resolves.toBeNull();
  });

  // exportRoomKeys hands back JSON text, so it must be parsed, and the JSON variant
  // must not stringify it a second time.
  it('parses the room key export and does not re-encode the JSON variant', async () => {
    const exported = JSON.stringify([{ session_id: 'a' }, { session_id: 'b' }]);
    mockInvoke.mockResolvedValue(exported);

    await expect(crypto().exportRoomKeys()).resolves.toHaveLength(2);
    await expect(crypto().exportRoomKeysAsJson()).resolves.toBe(exported);
  });

  it('keys cross-signing keys by the SDK enum and parses each JSON blob', async () => {
    mockInvoke.mockResolvedValue({
      userId: '@me:example.org',
      isVerified: true,
      wasPreviouslyVerified: true,
      masterKey: JSON.stringify({ keys: { 'ed25519:AAA': 'AAA' }, usage: ['master'] }),
      selfSigningKey: JSON.stringify({ keys: { 'ed25519:BBB': 'BBB' }, usage: ['self_signing'] }),
      userSigningKey: JSON.stringify({ keys: { 'ed25519:CCC': 'CCC' }, usage: ['user_signing'] }),
    });

    const keys = await crypto().getUserCrossSigningKeys('@me:example.org');

    expect(Object.keys(keys ?? {})).toEqual([
      CrossSigningKey.Master,
      CrossSigningKey.SelfSigning,
      CrossSigningKey.UserSigning,
    ]);
    expect(keys?.[CrossSigningKey.Master]?.keys).toEqual({ 'ed25519:AAA': 'AAA' });
  });

  it('resolves a cross-signing key id through that mapping', async () => {
    mockInvoke.mockResolvedValue({
      userId: '@me:example.org',
      isVerified: true,
      wasPreviouslyVerified: true,
      masterKey: JSON.stringify({ keys: { 'ed25519:AAA': 'AAA' }, usage: ['master'] }),
    });

    await expect(crypto().getCrossSigningKeyId()).resolves.toBe('AAA');
  });

  it('reads own device keys from identityKeys', async () => {
    mockInvoke.mockResolvedValue({ ed25519: 'ed', curve25519: 'curve' });

    await expect(crypto().getOwnDeviceKeys()).resolves.toEqual({
      ed25519: 'ed',
      curve25519: 'curve',
    });
  });

  it('reads cross-signing status from the hasX flags', async () => {
    mockInvoke.mockResolvedValue({
      hasMaster: true,
      hasSelfSigning: true,
      hasUserSigning: false,
    });

    const status = await crypto().getCrossSigningStatus();
    expect(status.publicKeysOnDevice).toBe(false);
    expect(status.privateKeysCachedLocally).toEqual({
      masterKey: true,
      selfSigningKey: true,
      userSigningKey: false,
    });
  });
});
