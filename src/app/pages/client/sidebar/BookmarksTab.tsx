import { useNavigate } from 'react-router-dom';

import {
  SidebarAvatar,
  SidebarItem,
  SidebarItemTooltip,
  SidebarUnreadBadge,
} from '$components/sidebar';
import { getInboxBookmarksPath } from '$pages/pathUtils';
import { useInboxBookmarksSelected } from '$hooks/router/useInbox';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useFiredReminderCount } from '$features/bookmarks/useBookmarks';
import { BookmarkSimple, getPhosphorIconSize } from '$components/icons/phosphor';

export function BookmarksTab() {
  const navigate = useNavigate();
  const bookmarksSelected = useInboxBookmarksSelected();
  const [enableMessageBookmarks] = useSetting(settingsAtom, 'enableMessageBookmarks');
  const firedReminderCount = useFiredReminderCount();

  if (!enableMessageBookmarks) return null;

  const handleClick = () => {
    navigate(getInboxBookmarksPath());
  };

  return (
    <SidebarItem active={bookmarksSelected}>
      <SidebarItemTooltip tooltip="Bookmarks">
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={handleClick} size="300">
            <BookmarkSimple
              size={getPhosphorIconSize('inline')}
              weight={bookmarksSelected ? 'fill' : 'regular'}
            />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {firedReminderCount > 0 && <SidebarUnreadBadge highlight count={firedReminderCount} />}
    </SidebarItem>
  );
}
