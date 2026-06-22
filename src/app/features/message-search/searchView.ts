import { SearchOrderBy } from '$types/matrix-sdk';
import type { ResultGroup, ResultItem } from './useMessageSearch';

export function isGroupedSearchView(grouped?: string): boolean {
  return grouped === 'true';
}

export type TimelineSearchItem = ResultItem & {
  roomId: string;
};

export function flattenTimelineSearchItems(
  groups: ResultGroup[],
  order?: string
): TimelineSearchItem[] {
  const flatItems = groups.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      roomId: group.roomId,
    }))
  );

  if (order === SearchOrderBy.Rank) {
    return flatItems;
  }

  return flatItems.toSorted(
    (a, b) => (b.event.origin_server_ts ?? 0) - (a.event.origin_server_ts ?? 0)
  );
}
