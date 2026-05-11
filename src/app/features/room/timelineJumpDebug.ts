type TimelineJumpDebugEntry = {
  ts: number;
  source: 'sync' | 'viewport';
  event: string;
  data?: Record<string, unknown>;
};

const MAX_ENTRIES = 400;
const store: TimelineJumpDebugEntry[] = [];

export const pushTimelineJumpDebug = (
  source: TimelineJumpDebugEntry['source'],
  event: string,
  data?: Record<string, unknown>
): void => {
  store.push({ ts: Date.now(), source, event, data });
  if (store.length > MAX_ENTRIES) store.splice(0, store.length - MAX_ENTRIES);
};

export const dumpTimelineJumpDebug = (): string =>
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: store.length,
      entries: store.map((entry) => ({
        ...entry,
        ts: new Date(entry.ts).toISOString(),
      })),
    },
    null,
    2
  );

export const clearTimelineJumpDebug = (): void => {
  store.length = 0;
};

declare global {
  // eslint-disable-next-line no-var
  var __sableDumpTimelineJumpDebug: (() => string) | undefined;
  // eslint-disable-next-line no-var
  var __sableClearTimelineJumpDebug: (() => void) | undefined;
}

if (typeof globalThis !== 'undefined') {
  globalThis.__sableDumpTimelineJumpDebug = dumpTimelineJumpDebug;
  globalThis.__sableClearTimelineJumpDebug = clearTimelineJumpDebug;
}
