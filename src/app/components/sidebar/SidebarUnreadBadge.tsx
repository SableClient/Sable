import type { UnreadBadgeMode } from '$components/unread-badge';
import { UnreadBadge, resolveUnreadBadgeMode } from '$components/unread-badge';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SidebarItemBadge } from './SidebarItem';

type SidebarUnreadBadgeProps = {
  highlight?: boolean;
  count: number;
  dm?: boolean;
  mode?: UnreadBadgeMode;
};

export function SidebarUnreadBadge({
  highlight,
  count,
  dm,
  mode,
}: Readonly<SidebarUnreadBadgeProps>) {
  const [showUnreadCounts] = useSetting(settingsAtom, 'showUnreadCounts');
  const [badgeCountDMsOnly] = useSetting(settingsAtom, 'badgeCountDMsOnly');
  const [showPingCounts] = useSetting(settingsAtom, 'showPingCounts');
  const resolvedMode =
    mode ??
    resolveUnreadBadgeMode({
      highlight,
      count,
      dm,
      showUnreadCounts,
      badgeCountDMsOnly,
      showPingCounts,
    });

  return (
    <SidebarItemBadge mode={resolvedMode}>
      <UnreadBadge highlight={highlight} count={count} dm={dm} mode={resolvedMode} />
    </SidebarItemBadge>
  );
}
