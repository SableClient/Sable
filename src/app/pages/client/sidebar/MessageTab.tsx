import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '$components/sidebar';
import { getPhosphorIconSize } from '$components/icons/phosphor';
import { matchPath, useNavigate } from 'react-router-dom';
import { HOME_PATH, SETTINGS_PATH } from '$pages/paths';
import { ChatTextIcon } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { searchModalAtom } from '$state/searchModal';
import { useInboxSelected } from '$hooks/router/useInbox';

export function MessageTab({ isBottom }: { isBottom?: boolean }) {
  const navigate = useNavigate();
  const [searchSelected] = useAtom(searchModalAtom);
  const inboxSelected = useInboxSelected();
  const opened = !(matchPath(SETTINGS_PATH, location.pathname) || searchSelected || inboxSelected);
  const openSettings = () => navigate(HOME_PATH);

  return (
    <SidebarItem active={opened} isBottom={isBottom}>
      <SidebarItemTooltip tooltip="Messages" position={isBottom ? 'Top' : 'Right'}>
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={openSettings} size={'400'}>
            <ChatTextIcon
              size={getPhosphorIconSize(isBottom ? 'inline' : 'toolbar')}
              weight={opened ? 'fill' : 'regular'}
            />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
