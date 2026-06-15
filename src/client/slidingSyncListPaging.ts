import type { SlidingSyncListDiagnostics } from './slidingSync';

export const DEFAULT_LIST_WINDOW_EXPAND_BATCH = 30;

export type SlidingSyncListPagingInput = {
  diagnostics: SlidingSyncListDiagnostics;
  itemCount: number;
  lastVirtualIndex: number;
  allowEmptyExpansion?: boolean;
  batchSize?: number;
};

export const getNextSlidingSyncListWindowEnd = ({
  diagnostics,
  itemCount,
  lastVirtualIndex,
  allowEmptyExpansion = false,
  batchSize = DEFAULT_LIST_WINDOW_EXPAND_BATCH,
}: SlidingSyncListPagingInput): number | undefined => {
  if (diagnostics.rangeEnd + 1 >= diagnostics.knownCount) return undefined;

  const nearLoadedRangeTail =
    lastVirtualIndex >= 0 && lastVirtualIndex >= diagnostics.rangeEnd - 10;
  const nearRenderedTail =
    itemCount > 0 && lastVirtualIndex >= 0 && lastVirtualIndex >= itemCount - 10;
  const shouldExpand =
    nearLoadedRangeTail || nearRenderedTail || (itemCount === 0 && allowEmptyExpansion);
  if (!shouldExpand) return undefined;

  return diagnostics.rangeEnd + batchSize;
};
