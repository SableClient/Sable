import { Avatar, Box, Text } from 'folds';
import { ChatCircleDots, EnvelopeSimple, Tray, sizedIcon } from '$components/icons/phosphor';
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
} from '$hooks/router/useRouteSelected';
import { UnreadBadge } from '$components/unread-badge';
import { useNavToActivePathMapper } from '$hooks/useNavToActivePathMapper';
import { PageNavContent, PageNavHeader } from '$components/page';
import { PageNavShell } from '$components/page/PageNavShell';
import { useSidebarWidth } from '$hooks/useSidebarWidth';
import { useInviteCount } from '$hooks/useInviteCount';
import { useInboxNotificationCount } from '$hooks/useInboxNotificationCount';
import { BookmarkIcon } from '@phosphor-icons/react';

function InvitesNavItem({ hideText }: { hideText?: boolean }) {
  const invitesSelected = useInboxInvitesSelected();
  const inviteCount = useInviteCount();

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
            <Avatar
              size="200"
              radii="400"
              style={hideText ? { width: '100%', padding: '0' } : { height: '100%' }}
            >
              {sizedIcon(EnvelopeSimple, '100', { filled: invitesSelected })}
            </Avatar>
            {!hideText && (
              <Box as="span" grow="Yes">
                <Text as="span" size="Inherit" truncate>
                  Invites
                </Text>
              </Box>
            )}
            {inviteCount > 0 && <UnreadBadge highlight count={inviteCount} />}
          </Box>
        </NavItemContent>
      </NavLink>
    </NavItem>
  );
}

function NotificationsNavItem({ hideText }: { hideText?: boolean }) {
  const notificationsSelected = useInboxNotificationsSelected();
  const notificationCount = useInboxNotificationCount();

  return (
    <NavItem
      variant="Background"
      radii="400"
      highlight={notificationCount > 0}
      aria-selected={notificationsSelected}
    >
      <NavLink to={getInboxNotificationsPath()}>
        <NavItemContent>
          <Box as="span" grow="Yes" alignItems="Center" gap="200">
            <Avatar
              size="200"
              radii="400"
              style={hideText ? { width: '100%', padding: '0' } : { height: '100%' }}
            >
              {sizedIcon(ChatCircleDots, '100', { filled: notificationsSelected })}
            </Avatar>
            {!hideText && (
              <Box as="span" grow="Yes">
                <Text as="span" size="Inherit" truncate>
                  Notifications
                </Text>
              </Box>
            )}
            {notificationCount > 0 && <UnreadBadge highlight count={notificationCount} />}
          </Box>
        </NavItemContent>
      </NavLink>
    </NavItem>
  );
}

export function Inbox() {
  useNavToActivePathMapper('inbox');
  const bookmarksSelected = useInboxBookmarksSelected();

  const {
    curWidth,
    setCurWidth,
    roomSidebarWidth,
    setRoomSidebarWidth,
    setIsResizingSidebar,
    isMobile,
    hideText,
    oldSidebar,
  } = useSidebarWidth();

  return (
    <PageNavShell
      header={
        <PageNavHeader size="600">
          <Box grow="Yes" gap="300" justifyContent="Center">
            {!hideText ? (
              <Box grow="Yes">
                <Text
                  size="H4"
                  truncate
                  align={isMobile ? 'Center' : undefined}
                  style={{ width: '100%' }}
                >
                  Inbox
                </Text>
              </Box>
            ) : (
              sizedIcon(Tray, '200', { filled: true })
            )}
          </Box>
        </PageNavHeader>
      }
      curWidth={curWidth}
      setCurWidth={setCurWidth}
      roomSidebarWidth={roomSidebarWidth}
      setRoomSidebarWidth={setRoomSidebarWidth}
      setIsResizingSidebar={setIsResizingSidebar}
      isMobile={isMobile}
      oldSidebar={oldSidebar}
    >
      <PageNavContent>
        <Box direction="Column" gap="300">
          <NavCategory>
            <NotificationsNavItem hideText={hideText} />
            <InvitesNavItem hideText={hideText} />
            <NavItem variant="Background" radii="400" aria-selected={bookmarksSelected}>
              <NavLink to={getInboxBookmarksPath()}>
                <NavItemContent>
                  <Box as="span" grow="Yes" alignItems="Center" gap="200">
                    <Avatar size="200" radii="400">
                      {sizedIcon(BookmarkIcon, '100', {
                        filled: bookmarksSelected,
                      })}{' '}
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
          </NavCategory>
        </Box>
      </PageNavContent>
    </PageNavShell>
  );
}
