# Manual QA Matrix: PWA Push, Resume, and Cold Launch Recovery

Manual verification checklist for the current Charm PWA/mobile recovery work.

This matrix is intended to validate five problem areas:

1. background push delivery
2. app visibility and foreground/background recovery
3. content loading while backgrounded
4. service worker restart survival
5. long-idle reopen without broken restore or forced spring-boarding

## Scope

Prioritize these environments:

- iPhone Home Screen PWA
- Safari tab on iPhone
- Safari desktop PWA if available
- one desktop browser baseline for comparison

Use at least one account with:

- a DM
- a normal room
- an older event target that is not already loaded

If possible, keep Sentry breadcrumbs/metrics or console logs available during the run.

## Key Telemetry

Expected metrics/breadcrumb families for the current implementation:

- `sable.notification.clicked`
- `sable.notification.to_route`
- `sable.notification.jump_started`
- `sable.notification.jump_completed`
- `sable.notification.restore_ms`
- `sable.app.resume`
- `sable.app.launch_context`
- `sable.app.launch_context_age_ms`
- `notification.click` breadcrumbs
- `notification.restore` breadcrumbs
- `notification.push` breadcrumbs
- `service_worker.push` breadcrumbs

## Scenario 1: Warm Notification Tap

Environment:

- app already open
- app backgrounded briefly
- receive a notification for a room message

Steps:

1. Open the PWA and leave it signed in.
2. Background it for less than 1 minute.
3. Send a message from another account/device.
4. Tap the delivered notification.

Expected UI result:

- app returns without a login screen
- correct account is active
- target room opens
- target event context is loaded if an event id is present

Expected telemetry:

- `sable.notification.clicked`
- `sable.notification.to_route`
- `sable.notification.jump_started`
- `sable.notification.jump_completed`
- `sable.notification.restore_ms`
- no `sable.app.launch_context` event if bootstrap did not re-run

## Scenario 2: Cold Launch From Notification

Environment:

- app fully terminated by OS or manually swiped away
- receive a notification for a room message

Steps:

1. Force-close the PWA or leave it unused until iOS discards it.
2. Send a message from another account/device.
3. Tap the notification.

Expected UI result:

- app cold-launches
- correct account becomes active
- `/to/...` restore flow lands in the target room/event
- no stuck splash screen or dead-end landing page

Expected telemetry:

- `sable.notification.clicked`
- `sable.app.launch_context`
- `sable.app.launch_context_age_ms`
- `sable.notification.to_route`
- `sable.notification.jump_started`
- `sable.notification.jump_completed`

Notes:

- This is the scenario that distinguishes cold launch from warm resume.
- `sable.app.launch_context` should only appear when bootstrap consumed the persisted click marker.

## Scenario 3: BFCache / Persisted Pageshow Restore

Environment:

- app foregrounded, then backgrounded
- return without using a notification

Steps:

1. Open the app to a room.
2. Background it briefly.
3. Return through the app switcher.

Expected UI result:

- room context remains intact
- no visible full reload unless iOS actually discarded the app
- no incorrect account switch

Expected telemetry:

- `sable.app.resume` with `trigger=pageshow_persisted` when BFCache restore occurs
- or `sable.app.resume` with `trigger=visibilitychange` when it is a normal visible resume
- no `sable.app.launch_context`

## Scenario 4: Long Idle Reopen Without Notification

Environment:

- app left unused for at least 1 hour, ideally overnight

Steps:

1. Open the app and note the current room.
2. Leave it unused for a long period.
3. Reopen it directly from the Home Screen, not via a notification.

Expected UI result:

- app either restores warm state or performs a clean cold launch
- session remains valid
- sync reconnects without getting stuck
- user is not dumped into an unrelated room or broken blank state

Expected telemetry:

- `sable.app.resume` if the app survived
- or a normal bootstrap with no `sable.app.launch_context` if it was a plain cold open
- no notification restore events unless a notification initiated the open

## Scenario 5: Visible-App Push Suppression

Environment:

- app visible and focused in foreground

Steps:

1. Open a room and keep the app focused.
2. Send a message from another account/device.

Expected UI result:

- no duplicate OS notification while app is visibly foregrounded
- in-app banner or direct timeline update still occurs as appropriate

Expected telemetry:

- `notification.push` breadcrumbs may still exist
- room restore funnel metrics should not fire unless the user taps a notification

## Scenario 6: Background Push After SW Restart

Environment:

- app backgrounded long enough that iOS likely restarts the service worker

Steps:

1. Open the app once so session data is available to the SW.
2. Background the app for a while.
3. Send a message from another account/device.

Expected UI result:

- notification still appears, even if the SW had to restart
- tapping it still reaches the room/event

Expected telemetry:

- `notification.push` and `service_worker.push` breadcrumbs
- `sable.notification.clicked`
- if the tap causes a true cold bootstrap, also `sable.app.launch_context`

## Scenario 7: Cross-Account Background Notification

Environment:

- at least two signed-in sessions
- active session differs from the notified session

Steps:

1. Keep account A active.
2. Send a message to account B.
3. Tap the notification for account B.

Expected UI result:

- account B becomes active
- restore lands in account B’s room
- no intermediate wrong-account render that gets stuck

Expected telemetry:

- `notification.restore` breadcrumbs that may show waiting for target session or Matrix client switch
- `sable.notification.jump_completed` after account switch settles

## Failure Notes To Capture

If any scenario fails, note:

- platform and browser mode
- whether the app was warm, BFCache-restored, or clearly cold-launched
- whether the OS notification appeared
- whether tapping notification opened the right account
- whether `/to/...` route was visibly entered
- whether jump completed or stalled
- the latest breadcrumbs for:
  - `notification.click`
  - `notification.restore`
  - `notification.push`
  - `app.launch`
  - `app.visibility`

## Exit Criteria

This batch is behaving acceptably when:

- warm notification taps reliably restore the correct room
- cold notification launches produce `sable.app.launch_context`
- long-idle reopens do not conflate plain cold launch with notification-driven launch
- visible-app suppression avoids duplicate OS notifications
- cross-account notification taps consistently switch to the correct session before jumping
