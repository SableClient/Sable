import { CSSProperties, ReactNode } from 'react';
import { Box, Badge, toRem, Text } from 'folds';
import { millify } from '$plugins/millify';
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
          {millify(count)}
        </Text>
      )}
    </Badge>
  );
}
