import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { EngineCrypto } from './EngineCrypto';

const members = (): string[] =>
  Object.getOwnPropertyNames(EngineCrypto.prototype).filter((name) => name !== 'constructor');

describe('EngineCrypto surface', () => {
  // Names one member per interface so the class cannot be hollowed out to satisfy tsc.
  it.each([
    ['SyncCryptoCallbacks', 'preprocessToDeviceMessages'],
    ['SyncCryptoCallbacks', 'onSyncCompleted'],
    ['CryptoBackend', 'decryptEvent'],
    ['CryptoBackend', 'encryptEvent'],
    ['CryptoBackend', 'getBackupDecryptor'],
    ['CryptoApi verification', 'requestDeviceVerification'],
    ['CryptoApi trust', 'getDeviceVerificationStatus'],
    ['CryptoApi backup', 'restoreKeyBackup'],
    ['CryptoApi cross-signing', 'bootstrapCrossSigning'],
    ['CryptoApi secret storage', 'bootstrapSecretStorage'],
  ])('implements %s.%s', (_group, member) => {
    expect(members()).toContain(member);
  });

  // js-sdk re-emits CryptoEvents off the backend; without this, prompts never arrive.
  it('is an event emitter so js-sdk can re-emit crypto events', () => {
    const crypto = new EngineCrypto({} as MatrixClient, {
      userId: '@me:example.org',
      deviceId: 'D',
    });

    expect(typeof crypto.on).toBe('function');
    expect(typeof crypto.emit).toBe('function');
  });

  it('is the backend install.ts wires into the client', () => {
    const install = readFileSync('src/app/crypto/install.ts', 'utf8');

    expect(install).toMatch(/\bEngineCrypto\b/);
  });
});
