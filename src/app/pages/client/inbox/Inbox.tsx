import { Avatar, Box, Text, toRem } from 'folds';
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
import { SidebarResizer } from '$pages/client/sidebar/SidebarResizer';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useEffect, useState } from 'react';
import { mobileOrTabletLayout } from '$utils/user-agent';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { Icon, Icons } from '$app/icons';

function InvitesNavItem({ hideText }: { hideText?: boolean }) {
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
            <Avatar
              size="200"
              radii="400"
              style={hideText ? { width: '100%', padding: '0' } : { height: '100%' }}
            >
              <Icon src={Icons.Mail} size="100" filled={invitesSelected} />
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

function BookmarksNavItem({ hideText }: { hideText?: boolean }) {
  const bookmarksSelected = useInboxBookmarksSelected();

  return (
    <NavItem variant="Background" radii="400" aria-selected={bookmarksSelected}>
      <NavLink to={getInboxBookmarksPath()}>
        <NavItemContent>
          <Box as="span" grow="Yes" alignItems="Center" gap="200">
            <Avatar
              size="200"
              radii="400"
              style={hideText ? { width: '100%', padding: '0' } : { height: '100%' }}
            >
              <Icon src={Icons.Bookmark} size="100" filled={bookmarksSelected} />
            </Avatar>
            {!hideText && (
              <Box as="span" grow="Yes">
                <Text as="span" size="Inherit" truncate>
                  Bookmarks
                </Text>
              </Box>
            )}
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

  const [roomSidebarWidth, setRoomSidebarWidth] = useSetting(settingsAtom, 'roomSidebarWidth');
  const [curWidth, setCurWidth] = useState(roomSidebarWidth);

  useEffect(() => {
    setCurWidth(roomSidebarWidth);
  }, [roomSidebarWidth]);
  const screenSize = useScreenSizeContext();
  const isMobile = mobileOrTabletLayout() || screenSize === ScreenSize.Mobile;
  const hideText = curWidth <= 80 && !isMobile;

  return (
    <Box
      shrink="No"
      style={{
        position: 'relative',
        width: isMobile ? '100%' : toRem(curWidth),
      }}
    >
      <PageNav>
        <PageNavHeader>
          <Box grow="Yes" gap="300" justifyContent="Center">
            {!hideText ? (
              <Box grow="Yes">
                <Text size="H4" truncate>
                  Inbox
                </Text>
              </Box>
            ) : (
              <Icon src={Icons.Inbox} size="200" filled />
            )}
          </Box>
        </PageNavHeader>

        <PageNavContent>
          <Box direction="Column" gap="300">
            <NavCategory>
              <NavItem variant="Background" radii="400" aria-selected={notificationsSelected}>
                <NavLink to={getInboxNotificationsPath()}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" gap="200">
                      <Avatar
                        size="200"
                        radii="400"
                        style={hideText ? { width: '100%', padding: '0' } : { height: '100%' }}
                      >
                        <Icon src={Icons.MessageUnread} size="100" filled={notificationsSelected} />
                      </Avatar>
                      {!hideText && (
                        <Box as="span" grow="Yes">
                          <Text as="span" size="Inherit" truncate>
                            Notifications
                          </Text>
                        </Box>
                      )}
                    </Box>
                  </NavItemContent>
                </NavLink>
              </NavItem>
              <InvitesNavItem hideText={hideText} />
              {enableMessageBookmarks && <BookmarksNavItem hideText={hideText} />}
            </NavCategory>
          </Box>
        </PageNavContent>
      </PageNav>
      {!mobileOrTabletLayout() && (
        <SidebarResizer
          setCurWidth={setCurWidth}
          sidebarWidth={roomSidebarWidth}
          setSidebarWidth={setRoomSidebarWidth}
          instep={80}
          outstep={190}
          minValue={50}
          maxValue={500}
        />
      )}
    </Box>
  );
}
