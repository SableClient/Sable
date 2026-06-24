import { useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import {
  SidebarAvatar,
  SidebarUnreadBadge,
  SidebarItemTooltip,
  SidebarItem,
} from '$components/sidebar';
import {
  getInboxInvitesPath,
  getInboxNotificationsPath,
  getInboxPath,
  joinPathComponent,
} from '$pages/pathUtils';
import { useInboxSelected } from '$hooks/router/useInbox';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useNavToActivePathAtom } from '$state/hooks/navToActivePath';
import { useInviteCount } from '$hooks/useInviteCount';
import { getPhosphorIconSize, Tray } from '$components/icons/phosphor';

export function InboxTab({ isBottom }: { isBottom?: boolean }) {
  const screenSize = useScreenSizeContext();
  const navigate = useNavigate();
  const navToActivePath = useAtomValue(useNavToActivePathAtom());
  const inboxSelected = useInboxSelected();
  const inviteCount = useInviteCount();

  const handleInboxClick = () => {
    if (screenSize === ScreenSize.Mobile) {
      navigate(getInboxPath());
      return;
    }
    const activePath = navToActivePath.get('inbox');
    if (activePath) {
      navigate(joinPathComponent(activePath));
      return;
    }

    const path = inviteCount > 0 ? getInboxInvitesPath() : getInboxNotificationsPath();
    navigate(path);
  };

  return (
    <SidebarItem active={inboxSelected} isBottom={isBottom}>
      <SidebarItemTooltip tooltip="Inbox" position={isBottom ? 'Top' : 'Right'}>
        {(triggerRef) => (
          <SidebarAvatar
            as="button"
            ref={triggerRef}
            outlined
            onClick={handleInboxClick}
            size={'400'}
          >
            <Tray
              size={getPhosphorIconSize(isBottom ? 'inline' : 'toolbar')}
              weight={inboxSelected ? 'fill' : 'regular'}
            />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {inviteCount > 0 && <SidebarUnreadBadge highlight count={inviteCount} />}
    </SidebarItem>
  );
}
