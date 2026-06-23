import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '$components/sidebar';
import { GearSix, getPhosphorSize } from '$components/icons/phosphor';
import { useOpenSettings } from '$features/settings';
import { useMatch } from 'react-router-dom';
import { SETTINGS_PATH } from '$pages/paths';

export function SettingsTab({ isBottom }: { isBottom?: boolean }) {
  const opened = !!useMatch({
    path: SETTINGS_PATH,
    caseSensitive: true,
    end: false,
  });
  const openSettings = useOpenSettings();

  return (
    <SidebarItem active={opened} isBottom={isBottom}>
      <SidebarItemTooltip tooltip="Settings" position={isBottom ? 'Top' : 'Right'}>
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={openSettings} size="300">
            <GearSix size={getPhosphorSize().inline} weight={opened ? 'fill' : 'regular'} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
