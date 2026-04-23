import { Badge, color, Icon, Icons, Text } from 'folds';
import {
  SidebarAvatar,
  SidebarItem,
  SidebarItemBadge,
  SidebarItemTooltip,
} from '$components/sidebar';
import { useDeviceIds, useDeviceList, useSplitCurrentDevice } from '$hooks/useDeviceList';
import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  useDeviceVerificationStatus,
  useUnverifiedDeviceCount,
  VerificationStatus,
} from '$hooks/useDeviceVerificationStatus';
import { useCrossSigningActive } from '$hooks/useCrossSigning';
import { useOpenSettings } from '$features/settings';
import * as css from './UnverifiedTab.css';

function UnverifiedIndicator() {
  const mx = useMatrixClient();
  const openSettings = useOpenSettings();

  const crypto = mx.getCrypto();
  const [devices] = useDeviceList();

  const [currentDevice, otherDevices] = useSplitCurrentDevice(devices);

  const verificationStatus = useDeviceVerificationStatus(
    crypto,
    mx.getSafeUserId(),
    currentDevice?.device_id
  );
  const unverified = verificationStatus === VerificationStatus.Unverified;

  const otherDevicesId = useDeviceIds(otherDevices);
  const unverifiedDeviceCount = useUnverifiedDeviceCount(
    crypto,
    mx.getSafeUserId(),
    otherDevicesId
  );

  const hasUnverified =
    unverified || (unverifiedDeviceCount !== undefined && unverifiedDeviceCount > 0);
  return (
    <>
      {hasUnverified && (
        <SidebarItem className={css.UnverifiedTab}>
          <SidebarItemTooltip tooltip={unverified ? 'Unverified Device' : 'Unverified Devices'}>
            {(triggerRef) => (
              <SidebarAvatar
                className={unverified ? css.UnverifiedAvatar : css.UnverifiedOtherAvatar}
                as="button"
                ref={triggerRef}
                outlined
                onClick={() => openSettings('devices')}
              >
                <Icon
                  style={{
                    color: unverified ? color.Critical.Main : color.Warning.Main,
                  }}
                  src={Icons.ShieldUser}
                />
              </SidebarAvatar>
            )}
          </SidebarItemTooltip>
          {!unverified && unverifiedDeviceCount && unverifiedDeviceCount > 0 && (
            <SidebarItemBadge mode="count">
              <Badge variant="Warning" size="400" fill="Solid" radii="Pill" outlined={false}>
                <Text as="span" size="L400">
                  {unverifiedDeviceCount}
                </Text>
              </Badge>
            </SidebarItemBadge>
          )}
        </SidebarItem>
      )}
    </>
  );
}

export function UnverifiedTab() {
  const crossSigningActive = useCrossSigningActive();

  if (!crossSigningActive) return null;

  return <UnverifiedIndicator />;
}
