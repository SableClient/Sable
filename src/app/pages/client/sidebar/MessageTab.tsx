import {
  SidebarAvatar,
  SidebarItem,
  SidebarItemTooltip,
  SidebarUnreadBadge,
} from '$components/sidebar';
import { getPhosphorIconSize } from '$components/icons/phosphor';
import { matchPath, useNavigate } from 'react-router';
import { HOME_PATH, SETTINGS_PATH } from '$pages/paths';
import { ChatTextIcon } from '@phosphor-icons/react';
import { useAtomValue } from 'jotai';
import { useInboxSelected } from '$hooks/router/useRouteSelected';
import { Box, color, Text, toRem } from 'folds';
import { useNavigateSelected } from '$hooks/router/useRouteSelected';
import { useProfileSelected } from '$hooks/router/useRouteSelected';
import { getSpacePath } from '$pages/pathUtils';
import { lastVisitedSpaceIdAtom } from '$state/room/lastSpace';
import { allRoomsAtom } from '$state/room-list/roomList';
import { useRoomsUnread } from '$state/hooks/unread';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { resolveUnreadBadgeMode } from '$components/unread-badge';
import { useMobileTapActivation } from '$hooks/useMobileTapActivation';

export function MessageTab({ isBottom, isMobile }: { isBottom?: boolean; isMobile?: boolean }) {
  const rooms = useAtomValue(allRoomsAtom);
  const unread = useRoomsUnread(rooms, roomToUnreadAtom);

  const navigate = useNavigate();
  const lastSpaceId = useAtomValue(lastVisitedSpaceIdAtom);
  const navigateRouteActive = useNavigateSelected();
  const profileRouteActive = useProfileSelected();
  const inboxSelected = useInboxSelected();
  const opened = !(
    matchPath(SETTINGS_PATH, location.pathname) ||
    navigateRouteActive ||
    profileRouteActive ||
    inboxSelected
  );
  const onBack = () => {
    if (!lastSpaceId) {
      navigate(HOME_PATH);
      return;
    }

    navigate(getSpacePath(lastSpaceId));
  };
  const mobileTapActivation = useMobileTapActivation(isMobile ?? false, onBack, onBack);

  const [showUnreadCounts] = useSetting(settingsAtom, 'showUnreadCounts');
  const [badgeCountDMsOnly] = useSetting(settingsAtom, 'badgeCountDMsOnly');
  const [showPingCounts] = useSetting(settingsAtom, 'showPingCounts');
  const resolvedMode = unread
    ? resolveUnreadBadgeMode({
        highlight: !!unread.highlight,
        count: unread.total,
        showUnreadCounts,
        badgeCountDMsOnly,
        showPingCounts,
      })
    : undefined;

  return (
    <SidebarItem active={opened && !isMobile} isBottom={isBottom}>
      <SidebarItemTooltip tooltip="Messages" position={isBottom ? 'Top' : 'Right'}>
        {(triggerRef) => (
          <Box direction="Column" alignItems="Center">
            <SidebarAvatar
              as="button"
              ref={triggerRef}
              outlined={!isMobile}
              {...mobileTapActivation}
              size={'400'}
            >
              <ChatTextIcon
                size={getPhosphorIconSize(isBottom ? 'inline' : 'toolbar')}
                weight={opened ? 'fill' : 'regular'}
                mirrored
                color={opened && isMobile ? color.Primary.Main : color.Background.OnContainer}
              />
            </SidebarAvatar>
            {unread && (
              <Box
                style={
                  resolvedMode === 'dot'
                    ? { position: 'relative', left: toRem(-10), top: toRem(-30) }
                    : { position: 'relative', left: toRem(-12), top: toRem(-34) }
                }
              >
                <SidebarUnreadBadge
                  highlight={unread.highlight > 0}
                  count={unread.highlight > 0 ? unread.highlight : unread.total}
                />
              </Box>
            )}
            {isMobile && (
              <Text size="B300" priority="300">
                Messages
              </Text>
            )}
          </Box>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
