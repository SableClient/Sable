import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '$components/sidebar';
import { GearSix, getPhosphorIconSize } from '$components/icons/phosphor';
import { useOpenSettings } from '$features/settings';
import { matchPath } from 'react-router-dom';
import { SETTINGS_PATH } from '$pages/paths';
import { color } from 'folds';

export function SettingsTab({ isBottom, isMobile }: { isBottom?: boolean; isMobile?: boolean }) {
  const opened = !!matchPath(SETTINGS_PATH, location.pathname);
  const openSettings = useOpenSettings();

  return (
    <SidebarItem active={opened} isBottom={isBottom}>
      <SidebarItemTooltip tooltip="Settings" position={isBottom ? 'Top' : 'Right'}>
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={openSettings} size={'400'}>
            <GearSix
              size={getPhosphorIconSize(isBottom ? 'inline' : 'toolbar')}
              weight={opened ? 'fill' : 'regular'}
              color={opened && isMobile ? color.Primary.Main : color.Background.OnContainer}
            />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
