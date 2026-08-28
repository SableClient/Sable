import { forwardRef, useCallback } from 'react';
import { Dialog, Header, config, Box, Text } from 'folds';
import { useAtomValue, useSetAtom } from 'jotai';
import { logoutClient } from '$client/initMatrix';
import { activeSessionIdAtom, sessionsAtom } from '$state/sessions';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useCrossSigningActive } from '$hooks/useCrossSigning';
import {
  useDeviceVerificationStatus,
  VerificationStatus,
} from '$hooks/useDeviceVerificationStatus';
import { InfoCard } from './info-card';
import { AsyncError } from '$components/AsyncError';
import { Button } from '$components/button';

type LogoutDialogProps = {
  handleClose: () => void;
};
export const LogoutDialog = forwardRef<HTMLDivElement, LogoutDialogProps>(
  ({ handleClose }, ref) => {
    const mx = useMatrixClient();
    const sessions = useAtomValue(sessionsAtom);
    const activeSessionId = useAtomValue(activeSessionIdAtom);
    const setSessions = useSetAtom(sessionsAtom);
    const setActiveSessionId = useSetAtom(activeSessionIdAtom);
    const activeSession = sessions.find((s) => s.userId === activeSessionId) ?? sessions[0];
    const hasEncryptedRoom = !!mx.getRooms().find((room) => room.hasEncryptionStateEvent());
    const crossSigningActive = useCrossSigningActive();
    const verificationStatus = useDeviceVerificationStatus(
      mx.getCrypto(),
      mx.getSafeUserId(),
      mx.getDeviceId() ?? undefined
    );

    const [logoutState, logout] = useAsyncCallback<void, Error, []>(
      useCallback(async () => {
        await logoutClient(mx, activeSession);
        if (activeSession) {
          setSessions({ type: 'DELETE', session: activeSession });
          setActiveSessionId(
            sessions.find((s) => s.userId !== activeSession.userId)?.userId ?? undefined
          );
        }
        window.location.reload();
      }, [mx, activeSession, sessions, setSessions, setActiveSessionId])
    );

    const ongoingLogout = logoutState.status === AsyncStatus.Loading;

    return (
      <Dialog variant="Surface" ref={ref}>
        <Header
          style={{
            padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
            borderBottomWidth: config.borderWidth.B300,
          }}
          variant="Surface"
          size="500"
        >
          <Box grow="Yes">
            <Text size="H4">Logout</Text>
          </Box>
        </Header>
        <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
          {hasEncryptedRoom &&
            (crossSigningActive ? (
              verificationStatus === VerificationStatus.Unverified && (
                <InfoCard
                  variant="Critical"
                  title="Unverified Device"
                  description="Verify your device before logging out to save your encrypted messages."
                />
              )
            ) : (
              <InfoCard
                variant="Critical"
                title="Alert"
                description="Enable device verification or export your encrypted data from settings to avoid losing access to your messages."
              />
            ))}
          <Text priority="400">You’re about to log out. Are you sure?</Text>
          <AsyncError state={logoutState} prefix="Failed to logout" size="T300" />
          <Box direction="Column" gap="200">
            <Button
              variant="Critical"
              onClick={logout}
              loading={ongoingLogout}
              spinnerVariant="Critical"
              spinnerSize="200"
            >
              <Text size="B400">Logout</Text>
            </Button>
            <Button variant="Secondary" fill="Soft" onClick={handleClose} disabled={ongoingLogout}>
              <Text size="B400">Cancel</Text>
            </Button>
          </Box>
        </Box>
      </Dialog>
    );
  }
);
