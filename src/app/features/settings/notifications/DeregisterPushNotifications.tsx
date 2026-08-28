import { useCallback, useState } from 'react';
import { Box, color, config, Dialog, Header, IconButton, Text } from 'folds';
import { menuIcon, X } from '$components/icons/phosphor';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';
import { useAtom } from 'jotai';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useClientConfig } from '../../../hooks/useClientConfig';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { pushSubscriptionAtom } from '../../../state/pushSubscription';
import { deRegisterAllPushers } from './PushNotifications';
import { disableNativePush } from './NotificationTransport';
import { disableUnifiedPush } from './UnifiedPushNotifications';
import { SettingTile } from '../../../components/setting-tile';
import { isTauri } from '@tauri-apps/api/core';
import { Button } from '$components/button';

type ConfirmDeregisterDialogProps = {
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
};

function ConfirmDeregisterDialog({ onClose, onConfirm, isLoading }: ConfirmDeregisterDialogProps) {
  return (
    <ModalOverlay requestClose={onClose}>
      <Dialog variant="Surface">
        <Header style={{ padding: `0 ${config.space.S400}` }} variant="Surface" size="500">
          <Box grow="Yes">
            <Text size="H4">Reset All Push Notifications</Text>
          </Box>
          <IconButton size="300" radii="300" onClick={onClose} disabled={isLoading}>
            {menuIcon(X)}
          </IconButton>
        </Header>
        <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
          <Text>
            This will remove push notifications from all your sessions and devices. This action
            cannot be undone. Are you sure you want to continue?
          </Text>
          <Box direction="Column" gap="200" style={{ paddingTop: config.space.S200 }}>
            <Button
              variant="Critical"
              fill="Solid"
              onClick={onConfirm}
              loading={isLoading}
              spinnerVariant="Critical"
              spinnerSize="100"
            >
              <Text size="B400">Reset All</Text>
            </Button>
            <Button variant="Secondary" fill="Soft" onClick={onClose} disabled={isLoading}>
              <Text size="B400">Cancel</Text>
            </Button>
          </Box>
        </Box>
      </Dialog>
    </ModalOverlay>
  );
}

export function DeregisterAllPushersSetting() {
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const deregisterAll = useCallback(async () => {
    await deRegisterAllPushers(mx);
    if (isTauri()) {
      await Promise.allSettled([disableNativePush(mx, clientConfig), disableUnifiedPush(mx)]);
    }
  }, [mx, clientConfig]);
  const [deregisterState, runDeregisterAll] = useAsyncCallback(deregisterAll);
  const [isConfirming, setIsConfirming] = useState(false);
  const [, setPushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const [backgroundPushEnabled, setBackgroundPushEnabled] = useSetting(
    settingsAtom,
    'backgroundPushEnabled'
  );
  const [, setBackgroundPushProvider] = useSetting(settingsAtom, 'backgroundPushProvider');

  const [, setPushSubscription] = useAtom(pushSubscriptionAtom);

  const handleOpenConfirmDialog = () => {
    setIsConfirming(true);
  };

  const handleCloseConfirmDialog = () => {
    if (deregisterState.status === AsyncStatus.Loading) return;
    setIsConfirming(false);
  };

  const handleConfirmDeregister = async () => {
    try {
      await runDeregisterAll();
    } catch {
      return;
    }
    setPushNotifications(false);
    setPushSubscription(null);

    if (backgroundPushEnabled) {
      setBackgroundPushEnabled(false);
    }
    setBackgroundPushProvider(null);
    setIsConfirming(false);
  };

  return (
    <>
      {isConfirming && (
        <ConfirmDeregisterDialog
          onClose={handleCloseConfirmDialog}
          onConfirm={handleConfirmDeregister}
          isLoading={deregisterState.status === AsyncStatus.Loading}
        />
      )}

      <SettingTile
        title="Reset All Push Notifications"
        focusId="reset-all-push-notifications"
        description={
          <>
            This will remove push notifications from all your sessions/devices.
            <br />
            You will need to re-enable them on each device individually.
          </>
        }
        after={
          <Button
            size="300"
            radii="300"
            variant="Critical"
            fill="Soft"
            onClick={handleOpenConfirmDialog}
          >
            <Text size="B300">Reset All</Text>
          </Button>
        }
      >
        {deregisterState.status === AsyncStatus.Error && (
          <Text as="span" style={{ color: color.Critical.Main }} size="T200">
            <br />
            Failed to deregister devices. Please try again.
          </Text>
        )}
        {deregisterState.status === AsyncStatus.Success && (
          <Text as="span" style={{ color: color.Success.Main }} size="T200">
            <br />
            Successfully deregistered all devices.
          </Text>
        )}
      </SettingTile>
    </>
  );
}
