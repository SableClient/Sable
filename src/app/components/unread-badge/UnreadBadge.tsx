import type { CSSProperties, ReactNode } from 'react';
import { Box, Badge, toRem, Text } from 'folds';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';

type UnreadBadgeProps = {
  highlight?: boolean;
  count: number;
  /** Whether this badge belongs to a DM room. Used with the badgeCountDMsOnly setting. */
  dm?: boolean;
  mode?: UnreadBadgeMode;
};

type ResolveUnreadBadgeModeOptions = Omit<UnreadBadgeProps, 'mode'> & {
  showUnreadCounts: boolean;
  badgeCountDMsOnly: boolean;
  showPingCounts: boolean;
};

export type UnreadBadgeMode = 'dot' | 'count';

/**
 * Resolve whether an unread badge should render as a dot or a numeric count.
 *
 * @param options.count The unread count backing this badge. Non-positive counts always resolve to dot mode.
 * @param options.dm Whether the badge belongs to a direct message.
 * @param options.highlight Whether the badge represents a mention or keyword highlight.
 * @param options.showUnreadCounts Whether regular room unread badges should show counts.
 * @param options.badgeCountDMsOnly Whether direct message unread badges should show counts.
 * @param options.showPingCounts Whether highlight badges should show counts.
 * @returns `'count'` when the current badge context is allowed to show a number, otherwise `'dot'`.
 */
export function resolveUnreadBadgeMode({
  highlight,
  count,
  dm,
  showUnreadCounts,
  badgeCountDMsOnly,
  showPingCounts,
}: ResolveUnreadBadgeModeOptions): UnreadBadgeMode {
  const showNumber =
    count > 0 &&
    ((dm && badgeCountDMsOnly) || (!dm && showUnreadCounts) || (highlight && showPingCounts));

  return showNumber ? 'count' : 'dot';
}

export function formatUnreadBadgeCount(count: number, showEasterEggs: boolean): string {
  if (count <= 999) {
    return count.toString();
  }

  if (count === 1000) {
    return '1k';
  }

  return showEasterEggs ? ':3' : '1k+';
}

const styles: CSSProperties = {
  minWidth: toRem(16),
};
export function UnreadBadgeCenter({ children }: { children: ReactNode }) {
  return (
    <Box as="span" style={styles} shrink="No" alignItems="Center" justifyContent="Center">
      {children}
    </Box>
  );
}

export function UnreadBadge({ highlight, count, dm, mode }: UnreadBadgeProps) {
  const [showUnreadCounts] = useSetting(settingsAtom, 'showUnreadCounts');
  const [badgeCountDMsOnly] = useSetting(settingsAtom, 'badgeCountDMsOnly');
  const [showPingCounts] = useSetting(settingsAtom, 'showPingCounts');
  const [showEasterEggs] = useSetting(settingsAtom, 'showEasterEggs');
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
    <Badge
      variant={highlight ? 'Success' : 'Secondary'}
      size={resolvedMode === 'count' ? '400' : '200'}
      fill="Solid"
      radii="Pill"
      outlined={false}
    >
      {resolvedMode === 'count' && (
        <Text as="span" size="L400">
          {formatUnreadBadgeCount(count, showEasterEggs)}
        </Text>
      )}
    </Badge>
  );
}
