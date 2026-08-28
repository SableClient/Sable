import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CryptoApi } from '$types/matrix-sdk';
import type { SecretStorageKeyContent } from '$types/matrix/accountData';
import { ManualVerificationTile } from './ManualVerification';

const decodeRecoveryKey = vi.hoisted(() => vi.fn<(key: string) => Uint8Array>());
const checkKey = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
const storePrivateKey = vi.hoisted(() => vi.fn<() => void>());
const processDeviceLists = vi.hoisted(() => vi.fn<() => Promise<void>>());
const bootstrapCrossSigning = vi.hoisted(() => vi.fn<() => Promise<void>>());
const bootstrapSecretStorage = vi.hoisted(() => vi.fn<() => Promise<void>>());
const setDeviceVerified = vi.hoisted(() => vi.fn<() => Promise<void>>());
const loadSessionBackupPrivateKeyFromSecretStorage = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock('$types/matrix-sdk', () => ({ decodeRecoveryKey }));
vi.mock('$client/secretStorageKeys', () => ({ storePrivateKey }));
vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    getSafeUserId: () => '@me:example.org',
    getDeviceId: () => 'DEVICE',
    secretStorage: { checkKey },
    getCrypto: () =>
      ({
        processDeviceLists,
        bootstrapCrossSigning,
        bootstrapSecretStorage,
        setDeviceVerified,
        loadSessionBackupPrivateKeyFromSecretStorage,
      }) as unknown as CryptoApi,
  }),
}));

const KEY_ID = 'key-id';
const KEY_CONTENT = { algorithm: 'm.secret_storage.v1.aes-hmac-sha2' } as SecretStorageKeyContent;
const recoveryKey = new Uint8Array([1, 2, 3]);

const submitRecoveryKey = (value: string) => {
  const input = document.querySelector('form input') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  const form = input.closest('form') as HTMLFormElement;
  Object.defineProperty(form, input.name, { value: input, configurable: true });
  fireEvent.submit(form);
};

const renderTile = (queryClient: QueryClient) =>
  render(
    <QueryClientProvider client={queryClient}>
      <ManualVerificationTile secretStorageKeyId={KEY_ID} secretStorageKeyContent={KEY_CONTENT} />
    </QueryClientProvider>
  );

describe('ManualVerificationTile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decodeRecoveryKey.mockReturnValue(recoveryKey);
    checkKey.mockResolvedValue(true);
    processDeviceLists.mockResolvedValue(undefined);
    bootstrapCrossSigning.mockResolvedValue(undefined);
    bootstrapSecretStorage.mockResolvedValue(undefined);
    setDeviceVerified.mockResolvedValue(undefined);
    loadSessionBackupPrivateKeyFromSecretStorage.mockResolvedValue(undefined);
  });

  it('refreshes cross-signing public keys before importing the recovery key', async () => {
    renderTile(new QueryClient());

    submitRecoveryKey('valid-key');

    await waitFor(() => expect(screen.getByText('Device verified!')).toBeInTheDocument());
    expect(storePrivateKey).toHaveBeenCalledWith(KEY_ID, recoveryKey);
    expect(processDeviceLists).toHaveBeenCalledWith({ changed: ['@me:example.org'] });
    expect(bootstrapCrossSigning).toHaveBeenCalledAfter(processDeviceLists);
    expect(setDeviceVerified).toHaveBeenCalledWith('@me:example.org', 'DEVICE');
    expect(setDeviceVerified).toHaveBeenCalledAfter(bootstrapCrossSigning);
  });

  it('invalidates the cached verification status after bootstrapping', async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    renderTile(queryClient);

    submitRecoveryKey('valid-key');

    await waitFor(() => expect(screen.getByText('Device verified!')).toBeInTheDocument());
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['device-verification'] });
  });
});
