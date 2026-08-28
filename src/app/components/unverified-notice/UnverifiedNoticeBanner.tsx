import { useCallback, useEffect, useMemo, useState } from 'react';
import { color, Text } from 'folds';
import { ShieldWarningIcon } from '@phosphor-icons/react';
import { useOpenSettings } from '$features/settings';
import { useIsUnverified, useUnverifiedDevices } from '$pages/client/sidebar/UserMenuTab';
import { getLocalStorageItem, setLocalStorageItem } from '$state/utils/atomWithLocalStorage';
import { useRegisterGlobalBanner, type GlobalBanner } from '$state/globalBanners';

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

  const handleVerify = useCallback(() => {
    openSettings('devices');
  }, [openSettings]);

  const handleDismiss = useCallback(() => {
    setLocalStorageItem('dismissNotice', true);
    setIsDismissedNotice(true);
  }, []);

  const bannerData = useMemo<GlobalBanner | null>(() => {
    if (!hasUnverified || isDismissedNotice) return null;

    const title = isUnverified
      ? 'This Device is Unverified!'
      : `You have ${unverifiedDeviceCount === 1 ? 'an' : ''} Unverified Device${unverifiedDeviceCount !== 1 ? 's' : ''}!`;

    return {
      id: 'unverified-device-notice',
      priority: 50, // Lower priority than Sentry consent (50 < 100)
      icon: ShieldWarningIcon,
      title,
      description: (
        <Text size="T300" priority="300" style={{ color: color.Surface.OnContainer }}>
          An unverified device is unable to read old encrypted messages and might result in other
          people being unable to read your messages or to send you messages!
        </Text>
      ),
      primaryAction: {
        label: 'Verify',
        variant: 'Primary',
        onClick: handleVerify,
      },
      secondaryAction: {
        label: 'Dismiss',
        variant: 'Secondary',
        onClick: handleDismiss,
      },
    };
  }, [
    hasUnverified,
    isDismissedNotice,
    isUnverified,
    unverifiedDeviceCount,
    handleVerify,
    handleDismiss,
  ]);

  useRegisterGlobalBanner(bannerData);

  return null;
}
