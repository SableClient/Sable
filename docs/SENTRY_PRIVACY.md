# Sentry Privacy Policy

This document describes exactly what data the Sentry integration collects, what
is masked or blocked, and where the relevant code lives. For setup and
configuration details see [SENTRY_INTEGRATION.md](./SENTRY_INTEGRATION.md).

---

## What Is Collected

Sentry is **disabled by default when no DSN is configured** and can be **opted
in to by users** at any time via Settings → General → Diagnostics & Privacy.

### First-Login Consent Notice

When Sentry is configured, the app shows a dismissible notice the first time a
user loads Charm. The notice explains that crash reporting is available and
provides a one-click opt-in before any data is sent.

| Action                           | Effect                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **"Enable"**                     | Sentry enabled (`sable_sentry_enabled = 'true'`), page reloads so Sentry initialises — data collection begins after reload  |
| **"No thanks"** or **✕ dismiss** | Preference saved as opted-out (`sable_sentry_enabled = 'false'`); notice does not appear again; no Sentry data is ever sent |

The preference persists in `localStorage` and can be changed at any time in
**Settings → General → Diagnostics & Privacy**.

The storage key keeps the `sable_` prefix for compatibility with existing
installations and is not a current product-name signal.

**Code:** `src/app/components/telemetry-consent/TelemetryConsentBanner.tsx`

When enabled, the following categories of data are sent:

### Error Reports

- Exception type and stack trace (function names, file names, line numbers)
- Error message text — scrubbed of tokens and Matrix IDs before sending (see
  [What Is Scrubbed](#what-is-scrubbed))
- Browser and OS name/version
- JavaScript engine version
- Application release version (`VITE_APP_VERSION`)
- Sentry environment tag (`VITE_SENTRY_ENVIRONMENT`)
- Current URL path — tokens in query strings are redacted before sending

**Code:** `src/instrument.ts` — `beforeSend` callback

### Breadcrumbs (Action Trail)

Leading up to an error, Sentry records a trail of recent user actions:

- Navigation events (route changes)
- `console.error` and `console.warn` calls — filtered for sensitive patterns
  before sending
- Internal debug log entries (category, level, summary message) — filtered
  before sending

Breadcrumbs containing any of the patterns listed in
[What Is Scrubbed](#what-is-scrubbed) are sanitised in-place before leaving the
browser.

**Code:** `src/instrument.ts` — `beforeBreadcrumb` callback  
**Code:** `src/app/utils/debugLogger.ts` — Sentry breadcrumb integration

### Application Breadcrumbs

In addition to automatic navigation/console breadcrumbs, the following named
events are explicitly recorded as breadcrumbs:

| Event                                       | Category | Level         | Source                    |
| ------------------------------------------- | -------- | ------------- | ------------------------- |
| Session forcibly logged out by server       | `auth`   | warning       | `ClientRoot.tsx`          |
| Sync state changed to Reconnecting/Error    | `sync`   | warning/error | `SyncStatus.tsx`          |
| Sliding sync first run completed            | `sync`   | info          | `initMatrix.ts`           |
| Crypto store mismatch — wiping local stores | `crypto` | warning       | `initMatrix.ts`           |
| Key backup failed                           | `crypto` | error         | `useKeyBackup.ts`         |
| High media inflight request count           | `media`  | warning       | `ClientNonUIFeatures.tsx` |

**Code:** `src/app/pages/client/ClientRoot.tsx`, `src/app/pages/client/SyncStatus.tsx`,
`src/client/initMatrix.ts`, `src/app/hooks/useKeyBackup.ts`,
`src/app/pages/client/ClientNonUIFeatures.tsx`

### Component Error Capture

The following failure paths use explicit `captureException` because they are
caught by state management hooks and never propagate to React's ErrorBoundary:

| Failure                                        | Tag                                  | Source                        |
| ---------------------------------------------- | ------------------------------------ | ----------------------------- |
| Client failed to load (fetch/init)             | `phase: load`                        | `ClientRoot.tsx`              |
| Client failed to start (sync start)            | `phase: start`                       | `ClientRoot.tsx`              |
| Background notification client failed to start | `component: BackgroundNotifications` | `BackgroundNotifications.tsx` |

**Code:** `src/app/pages/client/ClientRoot.tsx`,
`src/app/pages/client/BackgroundNotifications.tsx`

### Performance Traces

- Timing of React Router navigations (page-load and route-change latency)
- Custom spans for Matrix sync cycles, message send, and room data loading
- JavaScript CPU profiles during traced transactions (call-stack samples)

Performance data contains **no message content, no room names, and no user
identifiers**. Spans are labelled with operation names only.

| Span name               | Operation         | Source                 |
| ----------------------- | ----------------- | ---------------------- |
| `auth.login`            | `auth`            | `loginUtil.ts`         |
| `decrypt.event`         | `matrix.crypto`   | `EncryptedContent.tsx` |
| `decrypt.bulk`          | `matrix.crypto`   | `room.ts`              |
| `timeline.jump_load`    | `matrix.timeline` | `RoomTimeline.tsx`     |
| `message.send`          | `matrix.message`  | `RoomInput.tsx`        |
| Sliding sync processing | `matrix.sync`     | `slidingSync.ts`       |

**Sample rates:**

| Environment               | Traces | Profiles |
| ------------------------- | ------ | -------- |
| `production`              | 10%    | 10%      |
| `preview` / `development` | 100%   | 100%     |

**Code:** `src/instrument.ts` — `tracesSampleRate`, `profilesSampleRate`  
**Code:** `src/app/features/room/RoomInput.tsx` — message send span  
**Code:** `src/app/utils/room.ts`, `src/client/slidingSync.ts` — room/sync spans

### Custom Metrics

All metrics contain no message content, room names, or user identifiers.
Attribute values are limited to short enumerated strings (error codes, states)
or numeric measurements.

#### Authentication

| Metric                    | Type  | Attributes | What it tracks                       |
| ------------------------- | ----- | ---------- | ------------------------------------ |
| `sable.auth.login_failed` | count | `errcode`  | Login attempt failures by error code |

**Code:** `src/app/pages/auth/login/loginUtil.ts`

#### Cryptography

| Metric                              | Type         | Attributes                          | What it tracks                                   |
| ----------------------------------- | ------------ | ----------------------------------- | ------------------------------------------------ |
| `sable.decryption.failure`          | count        | `reason`                            | Unable-to-decrypt events by failure reason       |
| `sable.decryption.event_ms`         | distribution | —                                   | Per-event decryption latency                     |
| `sable.decryption.bulk_latency_ms`  | distribution | `event_count`                       | Bulk re-decryption time on room open             |
| `sable.crypto.key_backup_failures`  | count        | `errcode`                           | Key backup errors by code                        |
| `sable.crypto.store_wipe`           | count        | —                                   | Crypto store mismatch wipe-and-retry occurrences |
| `sable.crypto.verification_outcome` | count        | `outcome` (`completed`/`cancelled`) | E2E device verification outcomes                 |

**Code:** `src/app/features/room/message/EncryptedContent.tsx`,
`src/app/utils/room.ts`, `src/app/hooks/useKeyBackup.ts`,
`src/client/initMatrix.ts`, `src/app/components/DeviceVerification.tsx`

#### Messaging

| Metric                          | Type         | Attributes  | What it tracks                      |
| ------------------------------- | ------------ | ----------- | ----------------------------------- |
| `sable.message.send_latency_ms` | distribution | `encrypted` | Message send round-trip time        |
| `sable.message.send_error`      | count        | —           | Send errors from message composer   |
| `sable.message.send_failed`     | count        | —           | Local-echo `NOT_SENT` status events |

**Code:** `src/app/features/room/RoomInput.tsx`,
`src/app/features/room/RoomTimeline.tsx`

#### Timeline

| Metric                         | Type         | Attributes  | What it tracks                   |
| ------------------------------ | ------------ | ----------- | -------------------------------- |
| `sable.timeline.open`          | count        | `mode`      | Timeline render initiations      |
| `sable.timeline.render_window` | distribution | `mode`      | Initial virtual window size      |
| `sable.timeline.jump_load_ms`  | distribution | —           | Event-jump timeline load latency |
| `sable.timeline.reinit`        | count        | —           | Full timeline re-initialisations |
| `sable.pagination.error`       | count        | `direction` | Pagination errors by direction   |

**Code:** `src/app/features/room/RoomTimeline.tsx`

#### Sync

| Metric                            | Type         | Attributes                   | What it tracks                         |
| --------------------------------- | ------------ | ---------------------------- | -------------------------------------- |
| `sable.sync.transport`            | count        | `type` (`sliding`/`classic`) | Sync transport type used               |
| `sable.sync.cycle`                | count        | (various)                    | Completed sliding sync cycles          |
| `sable.sync.error`                | count        | `errcode`                    | Sliding sync errors                    |
| `sable.sync.initial_ms`           | distribution | —                            | Initial sync completion time           |
| `sable.sync.processing_ms`        | distribution | —                            | Per-cycle sync processing time         |
| `sable.sync.lists_loaded_ms`      | distribution | —                            | Time for room lists to fully load      |
| `sable.sync.total_rooms`          | gauge        | `sync_type`                  | Total rooms known at list load         |
| `sable.sync.active_subscriptions` | gauge        | —                            | Active room subscription count         |
| `sable.sync.client_ready_ms`      | distribution | `type`                       | Time from init to client ready         |
| `sable.sync.time_to_ready_ms`     | distribution | —                            | Wall-clock time to first sync ready    |
| `sable.sync.degraded`             | count        | `state`                      | Sync reconnect/error state transitions |

**Code:** `src/client/initMatrix.ts`, `src/client/slidingSync.ts`,
`src/app/pages/client/ClientRoot.tsx`, `src/app/pages/client/SyncStatus.tsx`

#### Media

| Metric                          | Type         | Attributes | What it tracks               |
| ------------------------------- | ------------ | ---------- | ---------------------------- |
| `sable.media.upload_latency_ms` | distribution | `mimetype` | Media upload round-trip time |
| `sable.media.upload_bytes`      | distribution | `mimetype` | Upload size distribution     |
| `sable.media.upload_error`      | count        | `reason`   | Upload failures by reason    |
| `sable.media.blob_cache_size`   | gauge        | —          | Blob URL cache entry count   |
| `sable.media.inflight_requests` | gauge        | —          | Concurrent media requests    |

**Code:** `src/app/utils/matrix.ts`, `src/app/pages/client/ClientNonUIFeatures.tsx`

#### Background clients & debug telemetry

| Metric                          | Type  | Attributes | What it tracks                         |
| ------------------------------- | ----- | ---------- | -------------------------------------- |
| `sable.background.client_count` | gauge | —          | Active background notification clients |
| `sable.errors`                  | count | `category` | Error-level debug log entries          |
| `sable.warnings`                | count | `category` | Warning-level debug log entries        |

**Code:** `src/app/pages/client/BackgroundNotifications.tsx`,
`src/app/utils/debugLogger.ts`

### Session Replay _(opt-in, disabled by default)_

When session replay is explicitly enabled by the user, Sentry records UI
interactions to help reproduce bugs. **All content is masked at the browser
level before any data leaves the device:**

- All text on screen → replaced with `█` characters
- All images, video, and audio → blocked entirely (replaced with a grey box)
- All form inputs, including the message composer → replaced with `*` characters

This means **no Matrix messages, no room names, no user display names, and no
media are ever visible in a replay**.

Sample rates for replay:

| Trigger              | Production | Preview / Dev |
| -------------------- | ---------- | ------------- |
| Regular sessions     | 50%        | 100%          |
| Sessions with errors | 100%       | 100%          |

**Code:** `src/instrument.ts` — `replayIntegration` call with `maskAllText`,
`blockAllMedia`, `maskAllInputs`

### Bug Reports _(manual, opt-in per report)_

When a user submits a bug report via `/bugreport` or the "Bug Report" button:

- Free-text description written by the user
- Optional: recent debug log entries (last 100) attached as a file
- Platform info, browser version, application version
- Checkbox to send or not send to Sentry is **shown before submission**

**Code:** `src/app/features/bug-report/BugReportModal.tsx`

---

## What Is Never Collected

- Matrix message content
- Room names or aliases
- User display names or avatars
- Contact lists or room member lists
- Encryption keys or session data
- IP addresses (`sendDefaultPii: false`)
- Authentication tokens (scrubbed — see below)

---

## What Is Scrubbed

All scrubbing happens **in the browser before data is transmitted**. Nothing
leaves the device in unredacted form.

### Tokens and Credentials

The following patterns are replaced with `[REDACTED]` in error messages,
exception values, breadcrumb messages, and request URLs:

- `access_token`
- `password`
- `token`
- `refresh_token`
- `session_id`
- `sync_token`
- `next_batch`
- HTTP `Authorization` headers

**Code:** `src/instrument.ts` — `beforeSend` and `beforeBreadcrumb` callbacks  
Regex: `/(access_token|password|token|refresh_token|session_id|sync_token|next_batch)([=:]\s*)([^\s&]+)/gi`

### Matrix Identifiers

Matrix IDs are replaced with placeholder tokens before sending:

| Original form  | Replaced with |
| -------------- | ------------- |
| `@user:server` | `@[USER_ID]`  |
| `!room:server` | `![ROOM_ID]`  |
| `$event_id`    | `$[EVENT_ID]` |

**Code:** `src/instrument.ts` — `beforeSend` callback (applied to `event.message`
and all `event.exception.values`)

---

## User Controls

Users can adjust Sentry behaviour without restarting the app:

| Setting                       | Location                                                                     | `localStorage` key                 | Default           |
| ----------------------------- | ---------------------------------------------------------------------------- | ---------------------------------- | ----------------- |
| Disable Sentry entirely       | Settings → General → Diagnostics & Privacy                                   | `sable_sentry_enabled`             | Enabled           |
| Enable session replay         | Settings → General → Diagnostics & Privacy                                   | `sable_sentry_replay_enabled`      | Disabled (opt-in) |
| Disable breadcrumb categories | Settings → Developer Tools → Error Tracking (Sentry) → Breadcrumb Categories | `sable_sentry_breadcrumb_disabled` | All enabled       |

**Rate limiting:** A maximum of 50 error events are forwarded to Sentry per page load (session).
Subsequent errors are silently dropped, protecting against quota exhaustion without affecting
in-app behaviour. Performance traces are not subject to this cap.

Changes to Sentry enable/disable and session replay take effect after the next page refresh
(the SDK is initialised once at startup). Breadcrumb category changes take effect immediately.

**Code:** `src/instrument.ts` — reads `localStorage` before `Sentry.init()`, enforces rate limit in `beforeSend`  
**Code:** `src/app/features/settings/developer-tools/SentrySettings.tsx` — settings UI  
**Code:** `src/app/utils/debugLogger.ts` — per-category breadcrumb filtering and session stats

---

## Data Residency

Sentry data is sent to the Sentry.io cloud service. The destination project is
configured by the operator via `VITE_SENTRY_DSN`. Self-hosted Sentry instances
are supported by changing the DSN.

When `VITE_SENTRY_DSN` is not set, the integration is entirely inactive — no
code path in the Sentry SDK is reached and no data is transmitted.

---

## Further Reading

- [SENTRY_INTEGRATION.md](./SENTRY_INTEGRATION.md) — setup, configuration, environment variables, and deployment instructions
- [Sentry Privacy Policy](https://sentry.io/privacy/) — Sentry's own data handling commitments
- [Sentry Session Replay privacy documentation](https://docs.sentry.io/product/explore/session-replay/privacy/) — details on masking and blocking behaviour
