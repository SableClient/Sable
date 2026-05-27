import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import * as Sentry from '@sentry/react';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('threadEvents');

/**
 * Extract threadId from a Matrix event and provide instrumentation for thread event handling.
 *
 * This module fixes the issue where thread reply events were silently dropped during
 * sliding sync. The SDK's EventTimelineSet.addEventToTimeline() rejects events with
 * threadId=undefined (by design), but the SDK's sliding sync processing doesn't extract
 * the threadId from m.relates_to before calling addEventToTimeline.
 *
 * The fix is in slidingSync.ts: we intercept the raw timeline events in the
 * RequestFinished lifecycle handler, extract threadId for each event, and manually
 * add them to the correct timeline set before the SDK's default handler runs.
 */
export function getThreadIdFromEvent(event: MatrixEvent): string | undefined {
  // Check m.relates_to for thread relationship
  const relatesTo = event.getContent()?.['m.relates_to'];
  if (relatesTo?.rel_type === 'm.thread' && typeof relatesTo.event_id === 'string') {
    return relatesTo.event_id; // This is the thread root ID = threadId
  }

  // Also check unsigned.m.relations for server-aggregated thread info
  const relations = event.getUnsigned()?.['m.relations'];
  if (relations?.['m.thread'] && typeof relations['m.thread'].event_id === 'string') {
    return relations['m.thread'].event_id;
  }

  return undefined;
}

/**
 * Install instrumentation to track thread events.
 *
 * Thread events are now correctly routed to their respective timeline sets
 * in slidingSync.ts. This instrumentation remains for observability.
 */
export function installThreadEventInstrumentation(mx: MatrixClient): void {
  debugLog.info('general', 'Thread event instrumentation installed', {
    userId: mx.getUserId(),
    note: 'Thread events now correctly routed in slidingSync.ts',
  });

  Sentry.addBreadcrumb({
    category: 'thread.instrumentation',
    message: 'Thread event tracking enabled',
    level: 'info',
    data: {
      userId: mx.getUserId(),
      note: 'Thread events correctly routed to timeline sets',
    },
  });
}
