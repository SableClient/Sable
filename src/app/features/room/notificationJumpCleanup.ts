import { stripRoomEventSegment } from '$pages/pathUtils';
import type { TimelineJumpMode } from '$hooks/timeline/useTimelineSync';

type NotificationJumpCleanupOptions = {
  eventId?: string;
  jumpMode?: TimelineJumpMode;
  atBottom: boolean;
  liveTimelineLinked: boolean;
};

export const shouldClearNotificationJumpRoute = ({
  eventId,
  jumpMode,
  atBottom,
  liveTimelineLinked,
}: NotificationJumpCleanupOptions): boolean =>
  Boolean(eventId && jumpMode === 'notification_live' && atBottom && liveTimelineLinked);

export const getNotificationJumpCleanupEventId = (
  options: NotificationJumpCleanupOptions
): string | undefined => (shouldClearNotificationJumpRoute(options) ? options.eventId : undefined);

export const buildNotificationJumpCleanupTarget = (
  pathname: string,
  search: string,
  eventId: string
): string => {
  const nextSearchParams = new URLSearchParams(search);
  nextSearchParams.delete('jumpMode');
  nextSearchParams.delete('joinCall');
  const nextSearch = nextSearchParams.toString();
  const nextPathname = stripRoomEventSegment(pathname, eventId);

  return nextSearch ? `${nextPathname}?${nextSearch}` : nextPathname;
};
