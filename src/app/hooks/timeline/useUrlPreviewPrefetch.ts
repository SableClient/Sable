import type { MutableRefObject } from 'react';
import { useCallback, useRef } from 'react';
import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { MsgType } from '$types/matrix-sdk';
import { prefetchUrlPreview } from '$components/url-preview';
import { testMatrixTo } from '$plugins/matrix-to';
import { testMatrixUri } from '$plugins/matrix-uri';
import type { ProcessedEvent } from './useProcessedTimeline';

// Rows of runway ahead of the rendered window for a preview to resolve in.
const PREFETCH_ROWS = 40;

// A whole pass at once saturates the per-host cap and delays the nearest rows; six matches it.
const MAX_IN_FLIGHT = 6;

const LINK_REGEX = /https?:\/\/[^\s<>"')\]]+/g;

const PREVIEWABLE_MSGTYPES = new Set<string>([MsgType.Text, MsgType.Notice, MsgType.Emote]);

export const previewableLinks = (mEvent: MatrixEvent): string[] => {
  const content = mEvent.getContent();
  if (!PREVIEWABLE_MSGTYPES.has(content.msgtype ?? '')) return [];
  const body = typeof content.body === 'string' ? content.body : '';
  const links = body.match(LINK_REGEX);
  if (!links) return [];
  return links.filter((url) => !testMatrixTo(url) && !testMatrixUri(url));
};

/** Row indices around the rendered window, nearest to it first. */
export const rowsByDistance = (
  startIndex: number,
  endIndex: number,
  rowCount: number,
  reach: number
): number[] => {
  const indices: number[] = [];
  for (let step = 1; step <= reach; step += 1) {
    const above = startIndex - step;
    const below = endIndex + step;
    if (above >= 0) indices.push(above);
    if (below < rowCount) indices.push(below);
  }
  return indices;
};

export const useUrlPreviewPrefetch = (
  mx: MatrixClient,
  enabled: boolean,
  eventsRef: MutableRefObject<ProcessedEvent[]>
) => {
  const lastRangeRef = useRef('');
  const queueRef = useRef<{ url: string; ts: number }[]>([]);
  const queuedRef = useRef(new Set<string>());
  const inFlightRef = useRef(0);

  const pump = useCallback(() => {
    while (inFlightRef.current < MAX_IN_FLIGHT) {
      const next = queueRef.current.shift();
      if (!next) return;
      queuedRef.current.delete(next.url);
      inFlightRef.current += 1;
      prefetchUrlPreview(mx, next.url, next.ts).finally(() => {
        inFlightRef.current -= 1;
        pump();
      });
    }
  }, [mx]);

  return useCallback(
    (startIndex: number, endIndex: number) => {
      if (!enabled) return;
      const events = eventsRef.current;
      // Row count is in the key so a page prepended without the reader moving still runs.
      const key = `${startIndex}:${endIndex}:${events.length}`;
      if (key === lastRangeRef.current) return;
      lastRangeRef.current = key;

      queueRef.current = [];
      queuedRef.current.clear();

      for (const index of rowsByDistance(startIndex, endIndex, events.length, PREFETCH_ROWS)) {
        const mEvent = events[index]?.mEvent;
        if (!mEvent) continue;
        const ts = mEvent.getTs();
        for (const url of previewableLinks(mEvent)) {
          if (queuedRef.current.has(url)) continue;
          queuedRef.current.add(url);
          queueRef.current.push({ url, ts });
        }
      }
      pump();
    },
    [enabled, eventsRef, pump]
  );
};
