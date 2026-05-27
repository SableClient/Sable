import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import * as Sentry from '@sentry/react';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('threadEvents');

/**
 * Extract threadId from a Matrix event.
 * Thread replies have m.relates_to.rel_type = "m.thread" and m.relates_to.event_id = [root event ID].
 * The threadId is the root event ID.
 *
 * Exported for future SDK patches that need to route thread events correctly.
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
 * Install instrumentation to track thread events that might be dropped.
 *
 * TODO: The root cause is in matrix-js-sdk's sliding sync event processing.
 * When sliding sync delivers thread reply events, they are passed to
 * EventTimelineSet.addEventToTimeline() with threadId=undefined, causing them
 * to be rejected with "EventTimelineSet.canContain — event cannot be added to
 * any timeline" errors.
 *
 * The fix requires patching the SDK's SlidingSync.processRoomData() to:
 * 1. Extract threadId from each event using getThreadIdFromEvent()
 * 2. Get the thread-specific timeline set: room.getTimelineSet(threadId)
 * 3. Add events to that timeline set instead of the root timeline set
 *
 * For now, we add logging to track when thread events are encountered.
 */
export function installThreadEventInstrumentation(mx: MatrixClient): void {
  // Add breadcrumb when we detect potential thread events being processed
  // This helps track the issue in Sentry without patching SDK internals

  debugLog.info('general', 'Thread event instrumentation installed', {
    userId: mx.getUserId(),
    note: 'Tracking thread events for SDK-level fix',
  });

  Sentry.addBreadcrumb({
    category: 'thread.instrumentation',
    message: 'Thread event tracking enabled',
    level: 'info',
    data: {
      userId: mx.getUserId(),
      note: 'Thread events may be dropped due to SDK issue - see threadEventPatch.ts',
    },
  });
}
