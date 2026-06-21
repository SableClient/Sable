import { Badge, color, Text } from 'folds';
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
import { getPhosphorIconSize, ShieldWarning } from '$components/icons/phosphor';
import * as css from './UnverifiedTab.css';

function UnverifiedIndicator({isBottom}:{isBottom?: boolean}) {
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
        <SidebarItem className={css.UnverifiedTab} isBottom={isBottom}>
          <SidebarItemTooltip
            tooltip={unverified ? 'Unverified Device' : 'Unverified Devices'}
            position={isBottom ? "Top" : "Right"}
          >
            {(triggerRef) => (
              <SidebarAvatar
                size="300"
                className={unverified ? css.UnverifiedAvatar : css.UnverifiedOtherAvatar}
                as="button"
                ref={triggerRef}
                outlined
                onClick={() => openSettings('devices')}
              >
                <ShieldWarning
                  style={{
                    color: unverified ? color.Critical.Main : color.Warning.Main,
                  }}
                  size={getPhosphorIconSize('toolbar')}
                />
              </SidebarAvatar>
            )}
          </SidebarItemTooltip>
          {!unverified && unverifiedDeviceCount && unverifiedDeviceCount > 0 && (
            <SidebarItemBadge mode="count">
              <Badge variant="Warning" size="300" fill="Solid" radii="Pill" outlined={false}>
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

export function UnverifiedTab({isBottom}:{isBottom?: boolean}) {
  const crossSigningActive = useCrossSigningActive();

  if (!crossSigningActive) return null;

  return <UnverifiedIndicator isBottom={isBottom}/>;
}
