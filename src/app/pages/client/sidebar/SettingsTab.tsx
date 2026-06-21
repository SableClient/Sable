import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '$components/sidebar';
import { GearSix, getPhosphorSize } from '$components/icons/phosphor';
import { useOpenSettings } from '$features/settings';
import { matchPath } from 'react-router-dom';
import { SETTINGS_PATH } from '$pages/paths';

export function SettingsTab({isBottom}:{isBottom?: boolean}) {
  const opened = !!matchPath(SETTINGS_PATH, location.pathname);
  const openSettings = useOpenSettings();

  return (
    <SidebarItem active={opened} isBottom={isBottom}>
      <SidebarItemTooltip tooltip="Search" position={isBottom ? "Top" : "Right"}>
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={openSettings} size="300">
            <GearSix size={getPhosphorSize().inline} weight={opened ? 'fill' : 'regular'} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
