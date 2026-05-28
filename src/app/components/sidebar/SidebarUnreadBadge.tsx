import type { UnreadBadgeMode } from '$components/unread-badge';
import { UnreadBadge, resolveUnreadBadgeMode } from '$components/unread-badge';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SidebarItemBadge } from './SidebarItem';

type SidebarUnreadBadgeProps = {
  highlight?: boolean;
  count: number;
  dm?: boolean;
  loud?: boolean;
  mode?: UnreadBadgeMode;
};

export function SidebarUnreadBadge({
  highlight,
  count,
  dm,
  loud,
  mode,
}: Readonly<SidebarUnreadBadgeProps>) {
  const [showUnreadCounts] = useSetting(settingsAtom, 'showUnreadCounts');
  const [badgeCountDMsOnly] = useSetting(settingsAtom, 'badgeCountDMsOnly');
  const [showLoudRoomCounts] = useSetting(settingsAtom, 'showLoudRoomCounts');
  const [showPingCounts] = useSetting(settingsAtom, 'showPingCounts');
  const resolvedMode =
    mode ??
    resolveUnreadBadgeMode({
      highlight,
      count,
      dm,
      loud,
      showUnreadCounts,
      badgeCountDMsOnly,
      showLoudRoomCounts,
      showPingCounts,
    });

  return (
    <SidebarItemBadge mode={resolvedMode}>
      <UnreadBadge highlight={highlight} count={count} dm={dm} loud={loud} mode={resolvedMode} />
    </SidebarItemBadge>
  );
}
