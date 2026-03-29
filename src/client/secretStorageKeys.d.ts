import type { CryptoCallbacks } from '$types/matrix-sdk';

export function storePrivateKey(keyId: string, privateKey: Uint8Array): void;
export function clearSecretStorageKeys(): void;
export const cryptoCallbacks: Pick<
  CryptoCallbacks,
  'getSecretStorageKey' | 'cacheSecretStorageKey'
>;
