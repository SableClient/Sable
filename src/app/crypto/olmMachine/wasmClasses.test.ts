import * as RustSdkCryptoJs from '@matrix-org/matrix-sdk-crypto-wasm';
import { describe, expect, it } from 'vitest';
import {
  encodeDecryptionSettings,
  encodeRoomSettings,
  encodeEncryptionSettings,
  graftWasmPrototypes,
  keyToBase64,
  toMegolmDecryptionError,
} from './wasmClasses';
import type { HydrationContext } from './hydrate';

describe('keyToBase64', () => {
  it('reads key material through toBase64 rather than String()', () => {
    const key = RustSdkCryptoJs.BackupDecryptionKey.createRandomKey();

    // eslint-disable-next-line typescript/no-base-to-string
    expect(String(key)).toBe('[object Object]');
    expect(keyToBase64(key)).toBe(key.toBase64());
  });

  it('passes through keys the engine already returned as base64', () => {
    expect(keyToBase64('c29tZS1rZXk')).toBe('c29tZS1rZXk');
  });
});

describe('toMegolmDecryptionError', () => {
  it('preserves the missing-room-key type needed by the backup downloader', () => {
    const error = toMegolmDecryptionError(
      'decryptRoomEvent failed: MissingRoomKey(None)'
    ) as RustSdkCryptoJs.MegolmDecryptionError;

    expect(error).toBeInstanceOf(RustSdkCryptoJs.MegolmDecryptionError);
    expect(error.code).toBe(RustSdkCryptoJs.DecryptionErrorCode.MissingRoomKey);
    expect(error.maybe_withheld).toBeUndefined();
  });

  it('uses the generic wasm error code for an unclassified Rust failure', () => {
    const error = toMegolmDecryptionError(
      'decryptRoomEvent failed: Store error'
    ) as RustSdkCryptoJs.MegolmDecryptionError;

    expect(error.code).toBe(RustSdkCryptoJs.DecryptionErrorCode.UnableToDecrypt);
  });
});

describe('encodeEncryptionSettings', () => {
  it('loses nothing that JSON.stringify would drop', () => {
    const settings = new RustSdkCryptoJs.EncryptionSettings();
    settings.rotationPeriodMessages = 42n;

    expect(JSON.parse(JSON.stringify(settings))).not.toHaveProperty('rotationPeriodMessages');
    expect(encodeEncryptionSettings(settings)).toMatchObject({
      algorithm: settings.algorithm,
      historyVisibility: settings.historyVisibility,
      rotationPeriodMessages: 42,
    });
  });

  it.each([
    ['onlyTrustedDevices', () => RustSdkCryptoJs.CollectStrategy.onlyTrustedDevices()],
    ['identityBasedStrategy', () => RustSdkCryptoJs.CollectStrategy.identityBasedStrategy()],
    ['allDevices', () => RustSdkCryptoJs.CollectStrategy.allDevices()],
  ])('preserves the %s sharing strategy', (expected, build) => {
    const settings = new RustSdkCryptoJs.EncryptionSettings();
    settings.sharingStrategy = build();

    expect(encodeEncryptionSettings(settings)?.sharingStrategy).toBe(expected);
  });

  it('does not silently widen a restrictive strategy to allDevices', () => {
    const settings = new RustSdkCryptoJs.EncryptionSettings();
    settings.sharingStrategy = RustSdkCryptoJs.CollectStrategy.deviceBasedStrategy(true, false);

    expect(encodeEncryptionSettings(settings)?.sharingStrategy).toBe('onlyTrustedDevices');
  });
});

describe('encodeDecryptionSettings', () => {
  it('carries the caller trust requirement across the boundary', () => {
    const settings = new RustSdkCryptoJs.DecryptionSettings(
      RustSdkCryptoJs.TrustRequirement.CrossSignedOrLegacy
    );

    expect(encodeDecryptionSettings(settings)).toEqual({
      senderDeviceTrustRequirement: RustSdkCryptoJs.TrustRequirement.CrossSignedOrLegacy,
    });
  });

  it('falls back to Untrusted when no settings are supplied', () => {
    expect(encodeDecryptionSettings(undefined)).toEqual({
      senderDeviceTrustRequirement: RustSdkCryptoJs.TrustRequirement.Untrusted,
    });
  });
});

describe('graftWasmPrototypes', () => {
  const ctx: HydrationContext = {
    call: async () => undefined,
    queueOutgoing: () => {},
    watchChanges: () => {},
    trackVerification: () => {},
  };

  it("turns nulls into undefined so js-sdk's `=== undefined` guards fire", () => {
    const grafted = graftWasmPrototypes(
      { className: 'SignatureUploadRequest', id: null, body: '{}' },
      ctx
    ) as { id?: unknown; body?: unknown };

    expect(grafted.id).toBeUndefined();
    expect(grafted.body).toBe('{}');
  });

  it('keeps the key as an own property so the wasm getter stays shadowed', () => {
    const grafted = graftWasmPrototypes(
      { className: 'SignatureUploadRequest', id: null, body: '{}' },
      ctx
    );

    // Reading through the prototype would hit `get id()` with no backing pointer.
    expect(Object.hasOwn(grafted, 'id')).toBe(true);
  });
});

describe('encodeRoomSettings', () => {
  it('reads the wasm accessors that JSON.stringify would drop', () => {
    const settings = new RustSdkCryptoJs.RoomSettings();
    settings.onlyAllowTrustedDevices = true;
    settings.sessionRotationPeriodMs = 604800000;
    settings.sessionRotationPeriodMessages = 100;

    expect(JSON.parse(JSON.stringify(settings))).not.toHaveProperty('onlyAllowTrustedDevices');
    expect(encodeRoomSettings(settings)).toMatchObject({
      algorithm: settings.algorithm,
      onlyAllowTrustedDevices: true,
      sessionRotationPeriodMs: 604800000,
      sessionRotationPeriodMessages: 100,
    });
  });
});
