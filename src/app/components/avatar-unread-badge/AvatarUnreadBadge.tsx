import { ReactNode } from 'react';
import classNames from 'classnames';
import { millify } from '$plugins/millify';
import * as css from './AvatarUnreadBadge.css';

type AvatarUnreadBadgeProps = {
  children: ReactNode;
  count?: number;
  highlight?: boolean;
  showBadge?: boolean;
};

/**
 * Wraps an Avatar component and overlays a small unread count badge
 * (Discord-style) when there are unread messages.
 */
export function AvatarUnreadBadge({
  children,
  count = 0,
  highlight = false,
  showBadge = false,
}: AvatarUnreadBadgeProps) {
  if (!showBadge || count === 0) {
    return <>{children}</>;
  }

  return (
    <div className={css.AvatarBadgeContainer}>
      {children}
      <div
        className={classNames(
          css.AvatarBadgeOverlay,
          highlight ? css.BadgeHighlight : css.BadgeSecondary
        )}
      >
        {millify(count)}
      </div>
    </div>
  );
}
