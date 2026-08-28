import { beforeEach, describe, expect, it } from 'vitest';
import { clearSecretStorageKeys, cryptoCallbacks, storePrivateKey } from './secretStorageKeys';

const KEY_A = 'key-account-a';
const KEY_B = 'key-account-b';

const ask = (...keyIds: string[]) =>
  cryptoCallbacks.getSecretStorageKey({
    keys: Object.fromEntries(keyIds.map((id) => [id, {}])),
  });

describe('secretStorageKeys', () => {
  beforeEach(() => {
    clearSecretStorageKeys();
  });

  it('returns a stored key for the requested key id', async () => {
    storePrivateKey(KEY_A, new Uint8Array([1, 2, 3]));

    const result = await ask(KEY_A);

    expect(result?.[0]).toBe(KEY_A);
    expect(result?.[1]).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('does not answer for a key id it has never seen', async () => {
    storePrivateKey(KEY_A, new Uint8Array([1]));

    expect(await ask(KEY_B)).toBeUndefined();
  });

  it('rejects a non-Uint8Array key', () => {
    expect(() => storePrivateKey(KEY_A, 'not-a-key' as unknown as Uint8Array)).toThrow(
      'Unable to store, privateKey is invalid.'
    );
  });

  // The cache is module-level and shared by every client in the tab, so an
  // account switch has to empty it or the previous account's 4S key lingers.
  it('holds nothing after a switch clears it', async () => {
    storePrivateKey(KEY_A, new Uint8Array([1]));
    storePrivateKey(KEY_B, new Uint8Array([2]));

    clearSecretStorageKeys();

    expect(await ask(KEY_A)).toBeUndefined();
    expect(await ask(KEY_B)).toBeUndefined();
  });

  it('lets the next account store its own key after a clear', async () => {
    storePrivateKey(KEY_A, new Uint8Array([1]));
    clearSecretStorageKeys();
    storePrivateKey(KEY_B, new Uint8Array([9]));

    expect((await ask(KEY_B))?.[1]).toEqual(new Uint8Array([9]));
    expect(await ask(KEY_A)).toBeUndefined();
  });
});
