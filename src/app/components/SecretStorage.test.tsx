import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SecretStorageKeyContent } from '$types/matrix/accountData';
import { SecretStorageRecoveryKey, SecretStorageRecoveryPassphrase } from './SecretStorage';

const decodeRecoveryKey = vi.hoisted(() =>
  vi.fn<(key: string) => Uint8Array>(() => new Uint8Array([1, 2, 3]))
);
const deriveRecoveryKeyFromPassphrase = vi.hoisted(() =>
  vi.fn<() => Promise<Uint8Array>>(async () => new Uint8Array([4, 5, 6]))
);
const checkKey = vi.hoisted(() => vi.fn<() => Promise<boolean>>());

vi.mock('$types/matrix-sdk', () => ({ decodeRecoveryKey, deriveRecoveryKeyFromPassphrase }));
vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({ secretStorage: { checkKey } }),
}));

const KEY_CONTENT = { algorithm: 'm.secret_storage.v1.aes-hmac-sha2' } as SecretStorageKeyContent;
const PASSPHRASE_CONTENT = {
  algorithm: 'm.pbkdf2',
  salt: 'salt',
  iterations: 10000,
  bits: 256,
};

const validKey = new Uint8Array([1, 2, 3]);

const submitRecoveryKey = (value: string) => {
  const input = document.querySelector('form input') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  const form = input.closest('form') as HTMLFormElement;
  // jsdom lacks named form-element properties (form.recoveryKeyInput), which
  // the component relies on in real browsers.
  Object.defineProperty(form, input.name, { value: input, configurable: true });
  fireEvent.submit(form);
};

describe('SecretStorageRecoveryKey', () => {
  beforeEach(() => {
    decodeRecoveryKey.mockReset();
    decodeRecoveryKey.mockReturnValue(validKey);
    checkKey.mockReset();
  });

  it('does not forward a key when decoding fails and shows the original error', async () => {
    const onDecodedRecoveryKey = vi.fn<(key: Uint8Array) => void>();
    decodeRecoveryKey.mockImplementation(() => {
      throw new Error('Malformed recovery key');
    });
    render(
      <SecretStorageRecoveryKey
        keyContent={KEY_CONTENT}
        onDecodedRecoveryKey={onDecodedRecoveryKey}
      />
    );

    submitRecoveryKey('not-a-key');

    expect(await screen.findByText('Malformed recovery key')).toBeInTheDocument();
    expect(onDecodedRecoveryKey).not.toHaveBeenCalled();
  });

  it('does not forward a key rejected by checkKey', async () => {
    const onDecodedRecoveryKey = vi.fn<(key: Uint8Array) => void>();
    checkKey.mockResolvedValue(false);
    render(
      <SecretStorageRecoveryKey
        keyContent={KEY_CONTENT}
        onDecodedRecoveryKey={onDecodedRecoveryKey}
      />
    );

    submitRecoveryKey('stale-key');

    expect(await screen.findByText('Invalid recovery key.')).toBeInTheDocument();
    expect(onDecodedRecoveryKey).not.toHaveBeenCalled();
  });

  it('does not forward a key when checkKey rejects', async () => {
    const onDecodedRecoveryKey = vi.fn<(key: Uint8Array) => void>();
    checkKey.mockRejectedValue(new Error('network gone'));
    render(
      <SecretStorageRecoveryKey
        keyContent={KEY_CONTENT}
        onDecodedRecoveryKey={onDecodedRecoveryKey}
      />
    );

    submitRecoveryKey('some-key');

    expect(await screen.findByText('network gone')).toBeInTheDocument();
    expect(onDecodedRecoveryKey).not.toHaveBeenCalled();
  });

  it('does not forward a non-Uint8Array result even when checkKey passes', async () => {
    const onDecodedRecoveryKey = vi.fn<(key: Uint8Array) => void>();
    decodeRecoveryKey.mockReturnValue('not-bytes' as unknown as Uint8Array);
    checkKey.mockResolvedValue(true);
    render(
      <SecretStorageRecoveryKey
        keyContent={KEY_CONTENT}
        onDecodedRecoveryKey={onDecodedRecoveryKey}
      />
    );

    submitRecoveryKey('some-key');

    await waitFor(() => expect(checkKey).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Verify')).toBeInTheDocument());
    expect(onDecodedRecoveryKey).not.toHaveBeenCalled();
  });

  it('forwards a valid decoded key exactly once', async () => {
    const onDecodedRecoveryKey = vi.fn<(key: Uint8Array) => void>();
    checkKey.mockResolvedValue(true);
    render(
      <SecretStorageRecoveryKey
        keyContent={KEY_CONTENT}
        onDecodedRecoveryKey={onDecodedRecoveryKey}
      />
    );

    submitRecoveryKey('valid-key');

    await waitFor(() => expect(onDecodedRecoveryKey).toHaveBeenCalledTimes(1));
    expect(onDecodedRecoveryKey).toHaveBeenCalledWith(validKey);
    expect(screen.queryByText('Invalid recovery key.')).not.toBeInTheDocument();
  });
});

describe('SecretStorageRecoveryPassphrase', () => {
  beforeEach(() => {
    deriveRecoveryKeyFromPassphrase.mockReset();
    deriveRecoveryKeyFromPassphrase.mockResolvedValue(validKey);
    checkKey.mockReset();
  });

  it('does not forward a key for an invalid passphrase', async () => {
    const onDecodedRecoveryKey = vi.fn<(key: Uint8Array) => void>();
    checkKey.mockResolvedValue(false);
    render(
      <SecretStorageRecoveryPassphrase
        keyContent={KEY_CONTENT}
        passphraseContent={PASSPHRASE_CONTENT}
        onDecodedRecoveryKey={onDecodedRecoveryKey}
      />
    );

    submitRecoveryKey('wrong passphrase');
    expect(await screen.findByText('Invalid recovery passphrase.')).toBeInTheDocument();
    expect(onDecodedRecoveryKey).not.toHaveBeenCalled();
  });

  it('forwards a valid passphrase-derived key exactly once', async () => {
    const onDecodedRecoveryKey = vi.fn<(key: Uint8Array) => void>();
    checkKey.mockResolvedValue(true);
    render(
      <SecretStorageRecoveryPassphrase
        keyContent={KEY_CONTENT}
        passphraseContent={PASSPHRASE_CONTENT}
        onDecodedRecoveryKey={onDecodedRecoveryKey}
      />
    );

    submitRecoveryKey('correct passphrase');

    await waitFor(() => expect(onDecodedRecoveryKey).toHaveBeenCalledTimes(1));
    expect(onDecodedRecoveryKey).toHaveBeenCalledWith(validKey);
  });
});
