import { useNavigate } from 'react-router-dom';
import { Icon, Icons } from 'folds';
import { useAtomValue } from 'jotai';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '$components/sidebar';
import { getInboxBookmarksPath, joinPathComponent } from '$pages/pathUtils';
import { useInboxBookmarksSelected } from '$hooks/router/useInbox';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useNavToActivePathAtom } from '$state/hooks/navToActivePath';

export function BookmarksTab() {
  const navigate = useNavigate();
  const navToActivePath = useAtomValue(useNavToActivePathAtom());
  const bookmarksSelected = useInboxBookmarksSelected();
  const [enableMessageBookmarks] = useSetting(settingsAtom, 'enableMessageBookmarks');

  if (!enableMessageBookmarks) return null;

  const handleClick = () => {
    const activePath = navToActivePath.get('inbox');
    if (activePath) {
      navigate(joinPathComponent(activePath));
      return;
    }
    navigate(getInboxBookmarksPath());
  };

  return (
    <SidebarItem active={bookmarksSelected}>
      <SidebarItemTooltip tooltip="Bookmarks">
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={handleClick}>
            <Icon src={Icons.Bookmark} filled={bookmarksSelected} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
