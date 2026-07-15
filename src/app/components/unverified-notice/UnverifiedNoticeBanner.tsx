import { Box, Button, color, Text } from 'folds';
import { sizedIcon } from '$components/icons/phosphor';
import * as css from './UnverifiedNoticeBanner.css';
import { useOpenSettings } from '$features/settings';
import { ShieldWarningIcon } from '@phosphor-icons/react';
import { useIsUnverified, useUnverifiedDevices } from '$pages/client/sidebar/UserMenuTab';
import { getLocalStorageItem, setLocalStorageItem } from '$state/utils/atomWithLocalStorage';
import { useEffect, useState } from 'react';

export function UnverifiedNoticeBanner() {
  const openSettings = useOpenSettings();

  const isUnverified = useIsUnverified();
  const unverifiedDeviceCount = useUnverifiedDevices();
  const hasUnverified = (unverifiedDeviceCount ?? 0) > 0;
  const [dismissCount, setDismissCount] = useState(unverifiedDeviceCount);

  const [isDismissedNotice, setIsDismissedNotice] = useState(
    getLocalStorageItem('dismissNotice', false)
  );
  useEffect(() => {
    if (
      unverifiedDeviceCount &&
      dismissCount &&
      unverifiedDeviceCount > 0 &&
      dismissCount < unverifiedDeviceCount
    ) {
      setLocalStorageItem('dismissNotice', false);
      setIsDismissedNotice(false);
    }
    setDismissCount(unverifiedDeviceCount);
  }, [unverifiedDeviceCount, dismissCount]);

  if (!hasUnverified || isDismissedNotice) return null;

  const handleVerify = () => {
    openSettings('devices');
  };
  const handleDismiss = () => {
    setLocalStorageItem('dismissNotice', true);
    setIsDismissedNotice(true);
  };

  return (
    <div className={css.Container}>
      <div className={css.Banner} role="region" aria-label="Crash reporting prompt">
        <div
          className={css.Header}
          style={{ color: isUnverified ? color.Critical.OnContainer : color.Warning.OnContainer }}
        >
          {sizedIcon(ShieldWarningIcon, '400')}
          <div className={css.HeaderText}>
            <Text size="H4">
              {isUnverified
                ? 'This Device is Unverified!'
                : `You have ${unverifiedDeviceCount === 1 ? 'an' : ''} Unverified Device${unverifiedDeviceCount !== 1 ? 's' : ''}!`}
            </Text>
            <Text
              size="T300"
              priority="300"
              style={{ textAlign: 'justify', color: color.Surface.OnContainer }}
            >
              An unverified device is unable to read old encrypted messages and might result in
              other people being unable to read your messages or to send you messages!
            </Text>
          </div>
        </div>
        <Box className={css.Actions}>
          <Button variant="Secondary" fill="Soft" size="300" radii="300" onClick={handleDismiss}>
            <Text size="B300">Dismiss</Text>
          </Button>
          <Button variant="Primary" fill="Solid" size="300" radii="300" onClick={handleVerify}>
            <Text size="B300">Verify</Text>
          </Button>
        </Box>
      </div>
    </div>
  );
}
