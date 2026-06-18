# Manual QA Checklist

Manual checks for the current Charm follow-up work on `#111`, `#103`, and `#109`.

## Issue #111: Mobile send button UX

Environment:

- iPhone-sized Safari layout
- Safari standalone PWA if available
- one room with delayed events enabled
- one room or account state where delayed events are unavailable

Steps:

1. Open a room and focus the composer so the keyboard is visible.
2. Type a short message and tap the main send button.
3. Confirm the message sends immediately while the keyboard is still open.
4. Type another message and tap the separate schedule button.
5. Close the schedule dialog without submitting.
6. Tap the main send button again.
7. Confirm the message sends immediately and the composer is not stuck.
8. Re-open the schedule dialog, choose a future time, and submit it.
9. Confirm the primary button reflects scheduled-send state and no immediate send occurs.
10. In a context where delayed events are unavailable, confirm there is no separate schedule button and normal sending still works.

Expected results:

- main send never depends on long-press
- schedule action is explicit and separate on mobile
- closing schedule UI does not break later sends

## Issue #103: Jump buttons broken

Environment:

- a room with enough history that the target event is not already in the loaded viewport
- at least one reply link, bookmark, or permalink target

Steps:

1. Open a reply link or permalink to an older message.
2. Confirm the target message appears before any snap back to the latest timeline.
3. Scroll upward from the jumped position.
4. Scroll downward from the jumped position.
5. Repeat using a bookmark jump if available.
6. Background the app briefly, return to foreground, and confirm the same jumped context remains stable.

Expected results:

- jump lands on the requested target
- timeline does not immediately snap to bottom
- surrounding scroll does not jitter or reset unexpectedly
- foreground return does not discard the event-targeted context too early

## Issue #109: PWA freeze instrumentation

Environment:

- Safari desktop PWA preferred
- Chromium installed PWA secondary
- one normal desktop browser baseline
- Sentry and browser console available if possible

Steps:

1. Launch the PWA and leave it idle for an extended period.
2. Return and attempt basic interaction:
   - focus the window without clicking anything first
   - switch rooms
   - open a DM
   - click the composer
   - click once after a 10+ minute idle interval to exercise first-interaction recovery
   - try a normal browser reload if the UI still responds
3. If the app freezes, note:
   - whether the window still repaints
   - whether clicks are ignored everywhere
   - whether reload is possible
4. Capture any visible console output and the latest Sentry breadcrumbs/metrics around:
   - app visibility changes
   - pageshow restore
   - window focus recovery
   - idle first-interaction recovery
   - service worker controller changes
   - service worker claim requests
   - service worker watchdog recovery attempts
   - background client startup or failure
   - forced reload requests

Expected results:

- enough telemetry exists to classify the freeze as controller churn, restore failure, background-client deadlock, sync/network stall, or input-only stale foreground state
