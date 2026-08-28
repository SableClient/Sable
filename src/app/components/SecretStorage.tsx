import type { FormEventHandler } from 'react';
import { useCallback } from 'react';
import { Box, Text } from 'folds';
import { decodeRecoveryKey, deriveRecoveryKeyFromPassphrase } from '$types/matrix-sdk';
import type {
  SecretStorageKeyContent,
  SecretStoragePassphraseContent,
} from '$types/matrix/accountData';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncError } from '$components/AsyncError';
import { useAlive } from '$hooks/useAlive';
import { PasswordInput } from './password-input';
import { Button } from '$components/button';

export enum SecretStorageKeyMethod {
  RecoveryPassphrase = 'passphrase',
  RecoveryKey = 'key',
}

type SecretStorageRecoveryPassphraseProps = {
  processing?: boolean;
  keyContent: SecretStorageKeyContent;
  passphraseContent: SecretStoragePassphraseContent;
  onDecodedRecoveryKey: (recoveryKey: Uint8Array) => void;
};
export function SecretStorageRecoveryPassphrase({
  processing,
  keyContent,
  passphraseContent,
  onDecodedRecoveryKey,
}: SecretStorageRecoveryPassphraseProps) {
  const mx = useMatrixClient();
  const alive = useAlive();

  const [driveKeyState, submitPassphrase] = useAsyncCallback<
    Uint8Array,
    Error,
    Parameters<typeof deriveRecoveryKeyFromPassphrase>
  >(
    useCallback(
      async (passphrase, salt, iterations, bits) => {
        const decodedRecoveryKey = await deriveRecoveryKeyFromPassphrase(
          passphrase,
          salt,
          iterations,
          bits
        );

        const match = await mx.secretStorage.checkKey(decodedRecoveryKey, keyContent as never);

        if (!match) {
          throw new Error('Invalid recovery passphrase.');
        }

        return decodedRecoveryKey;
      },
      [mx, keyContent]
    )
  );

  const drivingKey = driveKeyState.status === AsyncStatus.Loading;
  const loading = drivingKey || processing;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    if (loading) return;
    evt.preventDefault();

    const target = evt.target as HTMLFormElement | undefined;
    const recoveryPassphraseInput = target?.recoveryPassphraseInput as HTMLInputElement | undefined;
    if (!recoveryPassphraseInput) return;
    const recoveryPassphrase = recoveryPassphraseInput.value.trim();
    if (!recoveryPassphrase) return;

    const { salt, iterations, bits } = passphraseContent;
    submitPassphrase(recoveryPassphrase, salt, iterations, bits).then((decodedRecoveryKey) => {
      if (alive() && decodedRecoveryKey instanceof Uint8Array) {
        recoveryPassphraseInput.value = '';
        onDecodedRecoveryKey(decodedRecoveryKey);
      }
    });
  };

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Column" gap="100">
      <Box gap="200" alignItems="End">
        <Box grow="Yes" direction="Column" gap="100">
          <Text size="L400">Recovery Passphrase</Text>
          <PasswordInput
            name="recoveryPassphraseInput"
            size="400"
            variant="Secondary"
            radii="300"
            autoFocus
            required
            outlined
            readOnly={loading}
          />
        </Box>
        <Box shrink="No" gap="200">
          <Button
            type="submit"
            variant="Success"
            size="400"
            radii="300"
            loading={loading}
            spinnerSize="200"
            spinnerVariant="Success"
          >
            <Text as="span" size="B400">
              Verify
            </Text>
          </Button>
        </Box>
      </Box>
      <AsyncError state={driveKeyState} bold />
    </Box>
  );
}

type SecretStorageKeyPromptProps = {
  method: SecretStorageKeyMethod;
  processing?: boolean;
  keyContent: SecretStorageKeyContent;
  onDecodedRecoveryKey: (recoveryKey: Uint8Array) => void;
};
export function SecretStorageKeyPrompt({
  method,
  processing,
  keyContent,
  onDecodedRecoveryKey,
}: SecretStorageKeyPromptProps) {
  if (method === SecretStorageKeyMethod.RecoveryPassphrase && keyContent.passphrase) {
    return (
      <SecretStorageRecoveryPassphrase
        processing={processing}
        keyContent={keyContent}
        passphraseContent={keyContent.passphrase}
        onDecodedRecoveryKey={onDecodedRecoveryKey}
      />
    );
  }

  return (
    <SecretStorageRecoveryKey
      processing={processing}
      keyContent={keyContent}
      onDecodedRecoveryKey={onDecodedRecoveryKey}
    />
  );
}

type SecretStorageRecoveryKeyProps = {
  processing?: boolean;
  keyContent: SecretStorageKeyContent;
  onDecodedRecoveryKey: (recoveryKey: Uint8Array) => void;
};
export function SecretStorageRecoveryKey({
  processing,
  keyContent,
  onDecodedRecoveryKey,
}: SecretStorageRecoveryKeyProps) {
  const mx = useMatrixClient();
  const alive = useAlive();

  const [driveKeyState, submitRecoveryKey] = useAsyncCallback<Uint8Array, Error, [string]>(
    useCallback(
      async (recoveryKey) => {
        const decodedRecoveryKey = decodeRecoveryKey(recoveryKey);

        const match = await mx.secretStorage.checkKey(decodedRecoveryKey, keyContent as never);

        if (!match) {
          throw new Error('Invalid recovery key.');
        }

        return decodedRecoveryKey;
      },
      [mx, keyContent]
    )
  );

  const drivingKey = driveKeyState.status === AsyncStatus.Loading;
  const loading = drivingKey || processing;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();

    const target = evt.target as HTMLFormElement | undefined;
    const recoveryKeyInput = target?.recoveryKeyInput as HTMLInputElement | undefined;
    if (!recoveryKeyInput) return;
    const recoveryKey = recoveryKeyInput.value.trim();
    if (!recoveryKey) return;

    submitRecoveryKey(recoveryKey).then((decodedRecoveryKey) => {
      if (alive() && decodedRecoveryKey instanceof Uint8Array) {
        recoveryKeyInput.value = '';
        onDecodedRecoveryKey(decodedRecoveryKey);
      }
    });
  };

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Column" gap="100">
      <Box gap="200" alignItems="End">
        <Box grow="Yes" direction="Column" gap="100">
          <Text size="L400">Recovery Key</Text>
          <PasswordInput
            name="recoveryKeyInput"
            size="400"
            variant="Secondary"
            radii="300"
            autoFocus
            required
            outlined
            readOnly={loading}
          />
        </Box>
        <Box shrink="No" gap="200">
          <Button
            type="submit"
            variant="Success"
            size="400"
            radii="300"
            loading={loading}
            spinnerSize="200"
            spinnerVariant="Success"
          >
            <Text as="span" size="B400">
              Verify
            </Text>
          </Button>
        </Box>
      </Box>
      <AsyncError state={driveKeyState} bold />
    </Box>
  );
}
