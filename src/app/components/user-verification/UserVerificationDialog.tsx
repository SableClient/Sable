import type { ShowSasCallbacks } from '$types/matrix-sdk';
import { VerificationPhase, VerificationMethod } from '$types/matrix-sdk';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  config,
  Dialog,
  Header,
  IconButton,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
} from 'folds';
import { X } from '$components/icons/phosphor';
import FocusTrap from 'focus-trap-react';
import type { VerificationRequest, Verifier } from '$types/matrix-sdk';
import { CryptoEvent, VerificationRequestEvent, VerifierEvent } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { ContainerColor } from '$styles/ContainerColor.css';

const DialogHeaderStyles: CSSProperties = {
  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
  borderBottomWidth: config.borderWidth.B300,
};

type WaitingMessageProps = {
  message: string;
};
function WaitingMessage({ message }: WaitingMessageProps) {
  return (
    <Box alignItems="Center" gap="200">
      <Spinner variant="Secondary" size="200" />
      <Text size="T300">{message}</Text>
    </Box>
  );
}

type SasVerificationProps = {
  verifier: Verifier;
  onCancel: () => void;
};

function SasVerification({ verifier, onCancel }: SasVerificationProps) {
  const { t } = useTranslation();
  const [sasData, setSasData] = useState<ShowSasCallbacks>();

  useEffect(() => {
    verifier.on(VerifierEvent.ShowSas, setSasData);
    verifier.verify();
    return () => {
      verifier.removeListener(VerifierEvent.ShowSas, setSasData);
    };
  }, [verifier]);

  useEffect(() => {
    verifier.on(VerifierEvent.Cancel, onCancel);
    return () => {
      verifier.removeListener(VerifierEvent.Cancel, onCancel);
    };
  }, [verifier, onCancel]);

  if (sasData) {
    return <CompareEmoji sasData={sasData} />;
  }

  return (
    <Box direction="Column" gap="400">
      <WaitingMessage message={t('verification.verify_starting')} />
    </Box>
  );
}

function CompareEmoji({ sasData }: { sasData: ShowSasCallbacks }) {
  const { t } = useTranslation();
  const [confirmState, confirm] = useAsyncCallback(useCallback(() => sasData.confirm(), [sasData]));
  const emojiEntries = useMemo<{ id: string; emoji: string; name: string }[]>(
    () =>
      (sasData.sas.emoji ?? []).map(([emoji, name], index) => ({
        id: `emoji-${index}`,
        emoji,
        name,
      })),
    [sasData]
  );

  const confirming =
    confirmState.status === AsyncStatus.Loading || confirmState.status === AsyncStatus.Success;

  return (
    <Box direction="Column" gap="400">
      <Text>{t('verification.verify_confirm_emoji')}</Text>
      <Box
        className={ContainerColor({ variant: 'SurfaceVariant' })}
        style={{
          borderRadius: config.radii.R400,
          padding: config.space.S500,
        }}
        gap="700"
        wrap="Wrap"
        justifyContent="Center"
      >
        {emojiEntries.map(({ id, emoji, name }) => (
          <Box key={id} direction="Column" gap="100" justifyContent="Center" alignItems="Center">
            <Text size="H1">{emoji}</Text>
            <Text size="T200">{name}</Text>
          </Box>
        ))}
      </Box>
      <Box direction="Column" gap="200">
        <Button
          variant="Primary"
          fill="Soft"
          onClick={confirm}
          disabled={confirming}
          before={confirming && <Spinner size="100" variant="Primary" />}
        >
          <Text size="B400">{t('verification.verify_match_button')}</Text>
        </Button>
        <Button
          variant="Primary"
          fill="Soft"
          onClick={() => sasData.mismatch()}
          disabled={confirming}
        >
          <Text size="B400">{t('verification.verify_mismatch_button')}</Text>
        </Button>
      </Box>
    </Box>
  );
}

type UserVerificationDialogProps = {
  userId: string;
  dmRoomId: string;
  request?: VerificationRequest;
  onClose: () => void;
};

export function UserVerificationDialog({
  userId,
  dmRoomId,
  request,
  onClose,
}: UserVerificationDialogProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<VerificationPhase | undefined>(request?.phase);

  // Listen for phase changes on the request
  useEffect(() => {
    const onChange = () => {
      setPhase(request.phase);
    };
    request.on(VerificationRequestEvent.Change, onChange);
    return () => {
      request.removeListener(VerificationRequestEvent.Change, onChange);
    };
  }, [request]);

  const handleCancel = useCallback(() => {
    if (
      request &&
      request.phase !== VerificationPhase.Done &&
      request.phase !== VerificationPhase.Cancelled
    ) {
      request.cancel();
    }
    onClose();
  }, [request, onClose]);

  const handleAccept = useCallback(() => {
    request?.accept();
  }, [request]);

  const handleStart = useCallback(async () => {
    await request?.startVerification(VerificationMethod.Sas);
  }, [request]);

  // If we initiated the request (initiatedByMe = true), show our side
  // If we received the request (initiatedByMe = false), show the accept side

  if (!request || !phase) {
    // Waiting for verification request to arrive
    return (
      <Overlay open backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              clickOutsideDeactivates: false,
              escapeDeactivates: false,
            }}
          >
            <Dialog variant="Surface">
              <Header style={DialogHeaderStyles} variant="Surface" size="500">
                <Box grow="Yes">
                  <Text size="H4">{t('verification.verify_user_title')}</Text>
                </Box>
                <IconButton size="300" radii="300" onClick={handleCancel}>
                  X
                </IconButton>
              </Header>
              <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                <WaitingMessage message={t('verification.verify_wait_accept_title')} />
              </Box>
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    );
  }

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: false,
            escapeDeactivates: false,
          }}
        >
          <Dialog variant="Surface">
            <Header style={DialogHeaderStyles} variant="Surface" size="500">
              <Box grow="Yes">
                <Text size="H4">{t('verification.verify_user_title')}</Text>
              </Box>
              <IconButton size="300" radii="300" onClick={handleCancel}>
                X
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              {phase === VerificationPhase.Requested &&
                (request.initiatedByMe ? (
                  <Box direction="Column" gap="400">
                    <Text>{t('verification.verify_wait_accept')}</Text>
                    <WaitingMessage message={t('verification.verify_wait_accept_title')} />
                  </Box>
                ) : (
                  <Box direction="Column" gap="400">
                    <Text>{t('verification.verify_accept_button')}</Text>
                    <Button variant="Primary" fill="Solid" onClick={handleAccept}>
                      <Text size="B400">{t('verification.verify_accept_button')}</Text>
                    </Button>
                  </Box>
                ))}
              {phase === VerificationPhase.Ready &&
                (request.initiatedByMe ? (
                  <Box direction="Column" gap="400">
                    <Text>{t('verification.verify_starting')}</Text>
                    <Button variant="Primary" fill="Solid" onClick={handleStart}>
                      <Text size="B400">{t('verification.verify_start_button')}</Text>
                    </Button>
                  </Box>
                ) : (
                  <Box direction="Column" gap="400">
                    <Text>{t('verification.verify_wait_start')}</Text>
                    <WaitingMessage message={t('verification.verify_wait_start_title')} />
                  </Box>
                ))}
              {phase === VerificationPhase.Started && request.verifier && (
                <SasVerification verifier={request.verifier} onCancel={handleCancel} />
              )}
              {phase === VerificationPhase.Done && (
                <Box direction="Column" gap="400">
                  <Text size="H4">{t('verification.verify_done_title')}</Text>
                  <Text>{t('verification.verify_done_message')}</Text>
                  <Button variant="Primary" fill="Solid" onClick={onClose}>
                    <Text size="B400">{t('verification.verify_done_button')}</Text>
                  </Button>
                </Box>
              )}
              {phase === VerificationPhase.Cancelled && (
                <Box direction="Column" gap="400">
                  <Text>{t('verification.verify_cancelled_message')}</Text>
                  <Button variant="Primary" fill="Soft" onClick={handleCancel}>
                    <Text size="B400">{t('verification.verify_cancel_button')}</Text>
                  </Button>
                </Box>
              )}
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
