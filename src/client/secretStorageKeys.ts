import type { CryptoCallbacks } from '$types/matrix-sdk';

const secretStorageKeys = new Map<string, Uint8Array>();

export function storePrivateKey(keyId: string, privateKey: Uint8Array): void {
  if (privateKey instanceof Uint8Array === false) {
    throw new Error('Unable to store, privateKey is invalid.');
  }
  secretStorageKeys.set(keyId, privateKey);
}

function hasPrivateKey(keyId: string): boolean {
  return secretStorageKeys.get(keyId) instanceof Uint8Array;
}

function getPrivateKey(keyId: string): Uint8Array | undefined {
  return secretStorageKeys.get(keyId);
}

export function clearSecretStorageKeys(): void {
  secretStorageKeys.clear();
}

const getSecretStorageKey: NonNullable<CryptoCallbacks['getSecretStorageKey']> = async ({
  keys,
}) => {
  const keyIds = Object.keys(keys);
  const keyId = keyIds.find(hasPrivateKey);
  if (!keyId) return null;
  const privateKey = getPrivateKey(keyId);
  if (!privateKey) return null;
  return [keyId, privateKey];
};

const cacheSecretStorageKey: NonNullable<CryptoCallbacks['cacheSecretStorageKey']> = (
  keyId,
  _keyInfo,
  privateKey
) => {
  secretStorageKeys.set(keyId, privateKey);
};

export const cryptoCallbacks: Pick<
  CryptoCallbacks,
  'getSecretStorageKey' | 'cacheSecretStorageKey'
> = {
  getSecretStorageKey,
  cacheSecretStorageKey,
};
