import { Avatar, Box, Icon, Icons, Text } from 'folds';
import { useAtomValue } from 'jotai';
import { NavCategory, NavItem, NavItemContent, NavLink } from '$components/nav';
import {
  getInboxBookmarksPath,
  getInboxInvitesPath,
  getInboxNotificationsPath,
} from '$pages/pathUtils';
import {
  useInboxBookmarksSelected,
  useInboxInvitesSelected,
  useInboxNotificationsSelected,
} from '$hooks/router/useInbox';
import { UnreadBadge } from '$components/unread-badge';
import { allInvitesAtom } from '$state/room-list/inviteList';
import { useNavToActivePathMapper } from '$hooks/useNavToActivePathMapper';
import { PageNav, PageNavContent, PageNavHeader } from '$components/page';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';

function InvitesNavItem() {
  const invitesSelected = useInboxInvitesSelected();
  const allInvites = useAtomValue(allInvitesAtom);
  const inviteCount = allInvites.length;

  return (
    <NavItem
      variant="Background"
      radii="400"
      highlight={inviteCount > 0}
      aria-selected={invitesSelected}
    >
      <NavLink to={getInboxInvitesPath()}>
        <NavItemContent>
          <Box as="span" grow="Yes" alignItems="Center" gap="200">
            <Avatar size="200" radii="400">
              <Icon src={Icons.Mail} size="100" filled={invitesSelected} />
            </Avatar>
            <Box as="span" grow="Yes">
              <Text as="span" size="Inherit" truncate>
                Invites
              </Text>
            </Box>
            {inviteCount > 0 && <UnreadBadge highlight count={inviteCount} />}
          </Box>
        </NavItemContent>
      </NavLink>
    </NavItem>
  );
}

function BookmarksNavItem() {
  const bookmarksSelected = useInboxBookmarksSelected();

  return (
    <NavItem variant="Background" radii="400" aria-selected={bookmarksSelected}>
      <NavLink to={getInboxBookmarksPath()}>
        <NavItemContent>
          <Box as="span" grow="Yes" alignItems="Center" gap="200">
            <Avatar size="200" radii="400">
              <Icon src={Icons.Bookmark} size="100" filled={bookmarksSelected} />
            </Avatar>
            <Box as="span" grow="Yes">
              <Text as="span" size="Inherit" truncate>
                Bookmarks
              </Text>
            </Box>
          </Box>
        </NavItemContent>
      </NavLink>
    </NavItem>
  );
}

export function Inbox() {
  useNavToActivePathMapper('inbox');
  const notificationsSelected = useInboxNotificationsSelected();
  const [enableMessageBookmarks] = useSetting(settingsAtom, 'enableMessageBookmarks');
  const showBookmarks = enableMessageBookmarks;

  return (
    <PageNav>
      <PageNavHeader>
        <Box grow="Yes" gap="300">
          <Box grow="Yes">
            <Text size="H4" truncate>
              Inbox
            </Text>
          </Box>
        </Box>
      </PageNavHeader>

      <PageNavContent>
        <Box direction="Column" gap="300">
          <NavCategory>
            <NavItem variant="Background" radii="400" aria-selected={notificationsSelected}>
              <NavLink to={getInboxNotificationsPath()}>
                <NavItemContent>
                  <Box as="span" grow="Yes" alignItems="Center" gap="200">
                    <Avatar size="200" radii="400">
                      <Icon src={Icons.MessageUnread} size="100" filled={notificationsSelected} />
                    </Avatar>
                    <Box as="span" grow="Yes">
                      <Text as="span" size="Inherit" truncate>
                        Notifications
                      </Text>
                    </Box>
                  </Box>
                </NavItemContent>
              </NavLink>
            </NavItem>
            <InvitesNavItem />
            {showBookmarks && <BookmarksNavItem />}
          </NavCategory>
        </Box>
      </PageNavContent>
    </PageNav>
  );
}
