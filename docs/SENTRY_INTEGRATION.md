# Sentry Integration for Sable

This document describes the Sentry error tracking and monitoring integration added to Sable.
For a detailed breakdown of what data is collected and how it is protected, see [SENTRY_PRIVACY.md](./SENTRY_PRIVACY.md).

## Overview

Sentry is integrated with Sable to provide:

- **Error tracking**: Automatic capture and reporting of errors and exceptions
- **Performance monitoring**: Track application performance and identify bottlenecks
- **User feedback**: Collect bug reports with context from users
- **Session replay**: Record user sessions (with privacy controls) for debugging
- **Breadcrumbs**: Track user actions leading up to errors
- **Debug log integration**: Attach internal debug logs to error reports

## Bug Fixes (found via Sentry Replay)

Two non-Sentry bugs were found and fixed in the course of building this integration:

### Scroll-to-bottom after list→subscription timeline expansion

**Problem**: When a room with a single cached event (list subscription, `timeline_limit=1`) becomes
fully subscribed and the SDK delivers N new events, the `TimelineReset` fires before any events land
on the fresh timeline. The "stay at bottom" effect queues a `scrollToBottom` while the DOM is still
empty (range `end=0`). By the time real events load, the scroll has already fired against an empty
container and is a no-op — the user's view stalls mid-list.

**Fix**: The stay-at-bottom `useEffect` now increments `scrollToBottomRef.current.count` after
calling `setTimeline(getInitialTimeline(room))`, re-queuing the scroll for after the first batch of
events arrives and the DOM has content.

**File**: `src/app/features/room/RoomTimeline.tsx`

### TS2367 redundant phase guard in `useCallSignaling`

**Problem**: A `phase !== undefined` guard was always evaluating to `true` because the TypeScript
type for `phase` had no `undefined` branch at that point in the control flow.

**Fix**: Removed the dead branch. TypeScript no longer emits a TS2367 comparison error here.

**File**: `src/app/hooks/useCallSignaling.ts`

---

## Features

### 1. Automatic Error Tracking

All errors are automatically captured and sent to Sentry with:

- Stack traces
- User context (anonymized)
- Device and browser information
- Recent breadcrumbs (user actions)
- Debug logs (when enabled)

### 2. Debug Logger Integration

The internal debug logger now integrates with Sentry:

- **Breadcrumbs**: All debug logs are added as breadcrumbs for context
- **Error capture**: Errors logged to the debug logger are automatically sent to Sentry
- **Warning sampling**: 10% of warnings are sent to Sentry to avoid overwhelming the system
- **Log attachment**: Recent logs can be attached to bug reports for additional context

Key integration points:

- `src/app/utils/debugLogger.ts` - Enhanced with Sentry breadcrumb and error capture
- Automatic breadcrumb creation for all log entries
- Error objects in log data are captured as exceptions
- 10% sampling rate for warnings to control volume

### 3. Bug Report Modal Integration

The bug report modal (`/bugreport` command or "Bug Report" button) now includes:

- **Optional Sentry reporting**: Checkbox to send anonymous reports to Sentry
- **Debug log attachment**: Option to include recent debug logs (last 100 entries)
- **User feedback API**: Bug reports are sent as Sentry user feedback for better visibility
- **Privacy controls**: Users can opt-in to Sentry reporting

Integration points:

- `src/app/features/bug-report/BugReportModal.tsx` - Added Sentry options and submission logic
- Automatically attaches platform info, version, and user agent
- Links bug reports to Sentry events for tracking

### 4. Privacy & Security

Comprehensive data scrubbing (full details in [SENTRY_PRIVACY.md](./SENTRY_PRIVACY.md)):

- **Token masking**: All access tokens, passwords, and authentication data are redacted
- **Matrix ID anonymization**: User IDs, room IDs, and event IDs are masked
- **Session replay privacy**: All text, media, and form inputs are masked when replay is enabled
- **request header sanitization**: Authorization headers are removed
- **User opt-in**: Users can enable Sentry via settings

Sensitive patterns automatically redacted:

- `access_token`, `password`, `token`, `refresh_token`
- `session_id`, `sync_token`, `next_batch`
- Matrix user IDs (`@user:server`)
- Matrix room IDs (`!room:server`)
- Matrix event IDs (`$event_id`)

### 5. Settings UI

Sentry controls are split across two settings locations:

**Settings → General → Diagnostics & Privacy** (user-facing):

- **Enable/disable error reporting**: Toggle Sentry error tracking on/off
- **Session replay control**: Enable/disable session recording (opt-in)
- Link to the privacy policy

**Settings → Developer Tools → Error Tracking (Sentry)** (power-user):

- **Breadcrumb categories**: Granular control over which log categories are sent as breadcrumbs
- **Session stats**: Live error/warning counts for the current page load
- **Export debug logs**: Download the in-memory log buffer as JSON for offline analysis
- **Attach debug logs**: Manually attach recent logs to next error report
- **Test buttons**: Force an error, test feedback, test message capture

### 6. First-Login Consent Banner

When `VITE_SENTRY_DSN` is set and a user has never seen the crash-reporting notice (i.e. `sable_sentry_enabled` is absent from `localStorage`), a dismissible banner slides in from the bottom of the screen on first load. It explains that anonymous crash reporting is available and asks if the user wants to enable it.

**Actions available in the banner:**

| Button                    | Effect                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Enable**                | Sets `sable_sentry_enabled = true` in `localStorage` and reloads the page so Sentry initialises. Reporting begins after reload.  |
| **No thanks** / × (close) | Sets `sable_sentry_enabled = false` in `localStorage` and dismisses the banner with a fade-out animation. Sentry stays disabled. |

Once the user has interacted with the banner (either action), it never appears again. The same preference can be changed later in **Settings → General → Diagnostics & Privacy**.

**Implementation:** `src/app/components/telemetry-consent/TelemetryConsentBanner.tsx` — rendered inside the logged-in client layout so it only appears after a session is established.

> **Self-hosters**: If you do not set `VITE_SENTRY_DSN`, the banner is never shown and Sentry is entirely disabled at build time. No network requests are made to Sentry.

## Configuration

### Environment Variables

Configure Sentry via environment variables:

```env
# Required: Your Sentry DSN (if not set, Sentry is disabled)
VITE_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Required: Environment name - controls sampling rates
# - "production" = 10% trace/replay sampling (cost-effective for production)
# - "preview" = 100% trace/replay sampling (full debugging for PR previews)
# - "development" = 100% trace/replay sampling (full debugging for local dev)
VITE_SENTRY_ENVIRONMENT=production

# Optional: Release version for tracking (defaults to VITE_APP_VERSION)
VITE_SENTRY_RELEASE=1.7.0

# Optional: For uploading source maps to Sentry (CI/CD only)
SENTRY_AUTH_TOKEN=your-sentry-auth-token
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=your-project-slug
```

### Self-Hosting with Docker

Sable is compiled at build time, so `VITE_*` variables must be passed as Docker
**build arguments** — they cannot be injected at container runtime via a plain
`docker run -e` flag. The easiest way for self-hosters to supply them is with
a `.env` file and `docker-compose`.

#### 1. Create a `.env` file

```env
# .env  — never commit this file
VITE_SENTRY_DSN=https://your-key@oXXXXX.ingest.sentry.io/XXXXXXX
VITE_SENTRY_ENVIRONMENT=production
```

The `VITE_SENTRY_ENVIRONMENT` value controls sampling rates (see table below).
Leave it as `production` for a live deployment.

#### 2. Reference it in `docker-compose.yml`

The `args` block forwards the variables from `.env` into the Docker build
stage so Vite can embed them in the bundle:

```yaml
services:
  sable:
    build:
      context: .
      args:
        - VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
        - VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT}
    ports:
      - '8080:8080'
```

Then build and start with:

```bash
docker compose --env-file .env up --build
```

#### 3. Verify it worked

Open the browser console after loading your instance — you should see:

```
[Sentry] Initialized for production environment
[Sentry] DSN configured: https://your-key@o...
```

If you see `[Sentry] Disabled - no DSN provided`, the build arg was not
picked up — double-check the `args` block and that your `.env` file is in the
same directory as `docker-compose.yml`.

#### Building without Compose

If you use plain `docker build`, pass build args directly:

```bash
docker build \
  --build-arg VITE_SENTRY_DSN="https://your-key@oXXXXX.ingest.sentry.io/XXXXXXX" \
  --build-arg VITE_SENTRY_ENVIRONMENT="production" \
  -t sable .
```

> **Security note:** DSN values embedded in the JavaScript bundle are visible
> to any user who opens DevTools. This is normal and expected for Sentry DSNs —
> they are designed to be public-facing ingest keys. Rate-limiting and origin
> restrictions on the Sentry project side are the correct controls.

### Deployment Configuration

**Production deployment (from `dev` branch):**

- Set `VITE_SENTRY_ENVIRONMENT=production`
- Gets 10% sampling for traces and session replay
- Cost-effective for production usage
- Configured in `.github/workflows/cloudflare-web-deploy.yml`

**Preview deployments (PR previews, Cloudflare Pages):**

- Set `VITE_SENTRY_ENVIRONMENT=preview`
- Gets 100% sampling for traces and session replay
- Full debugging capabilities for testing
- Configured in `.github/workflows/cloudflare-web-preview.yml`

**Local development:**

- `VITE_SENTRY_ENVIRONMENT` not set (defaults to `development` via Vite MODE)
- Gets 100% sampling for traces and session replay
- Full debugging capabilities

**Sampling rates by environment:**

```
Environment    | Traces | Profiles | Session Replay | Error Replay
---------------|--------|----------|----------------|-------------
production     | 10%    | 10%      | 10%            | 100%
preview        | 100%   | 100%     | 100%           | 100%
development    | 100%   | 100%     | 100%           | 100%
```

> **Browser profiling requires a `Document-Policy: js-profiling` response header** on your HTML document.
> This is already included in the provided `Caddyfile` and nginx config. For other servers, add the header to
> the response serving `index.html`.

### User Preferences

Users can control Sentry via localStorage:

```javascript
// Disable Sentry entirely (requires page refresh)
localStorage.setItem('sable_sentry_enabled', 'false');

// Disable session replay only (requires page refresh)
localStorage.setItem('sable_sentry_replay_enabled', 'false');
```

Or use the UI in Settings → General → Diagnostics & Privacy.

## Custom Instrumentation

Beyond automatic error capture, Sable has hand-crafted monitoring at key
lifecycle points. See [SENTRY_PRIVACY.md](./SENTRY_PRIVACY.md) for the full
metrics reference. Key areas:

| Area                   | What's tracked                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**               | Login failures (by `errcode`), forced server logouts                                                                               |
| **Sync**               | Transport type, degraded states, cycle stats, initial sync latency, time-to-ready, total rooms loaded, active subscriptions        |
| **Cryptography**       | Decryption failures (by failure reason), key backup errors, store wipes, E2E verification outcomes, bulk decryption latency        |
| **Messaging**          | Send latency, send errors, local-echo `NOT_SENT` events                                                                            |
| **Timeline**           | Opens, virtual window size, jump-load latency, re-initialisations, `limited` sync resets, scroll offset at load, pagination errors |
| **Pagination**         | Pagination latency (`sable.pagination.latency_ms`) and errors per direction                                                        |
| **Sliding sync**       | Room subscription latency (`sable.sync.room_sub_latency_ms`), events per subscription batch (`sable.sync.room_sub_event_count`)    |
| **Scroll / UX**        | `atBottom` transitions with rapid-flip anomaly detection, scroll-to-bottom trigger warnings when user is scrolled up               |
| **Calls**              | `sable.call.start.attempt/error`, `sable.call.answered`, `sable.call.declined`, active/ended/timeout counters                      |
| **Message actions**    | `sable.message.delete.*`, `sable.message.forward.*`, `sable.message.report.*`, `sable.message.reaction.toggle`                     |
| **Media**              | Upload latency, upload size, cache stats                                                                                           |
| **Background clients** | Per-account notification client count, startup failures                                                                            |

Fatal errors that are caught by `useAsyncCallback` state (and therefore never
reach React's ErrorBoundary) are explicitly forwarded with `captureException`:

- Client load failure (`phase: load`)
- Client start failure (`phase: start`)
- Background notification client startup failure

### Breadcrumb categories

All hand-crafted breadcrumbs use structured Sentry categories that appear in
the Sentry issue timeline and can be filtered in the developer settings panel.

| Category          | Where emitted                                  | What it records                                                                |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `auth`            | `ClientRoot.tsx`                               | Login session start, forced logout                                             |
| `sync`            | `initMatrix.ts`, `SyncStatus.tsx`              | Sync state transitions, degraded states, client ready                          |
| `sync.sliding`    | `slidingSync.ts`                               | First room subscription data: latency, event count                             |
| `timeline.sync`   | `RoomTimeline.tsx`                             | SDK-initiated `TimelineReset` (limited sync gap) — fires before events arrive  |
| `timeline.events` | `RoomTimeline.tsx`                             | Every `eventsLength` batch: delta, batch size label, range gap, `atBottom`     |
| `ui.scroll`       | `RoomTimeline.tsx`                             | `atBottom` true→false transitions, rapid-flip warnings, scroll-to-bottom fires |
| `ui.timeline`     | `RoomTimeline.tsx`                             | Virtual paginator window shifts (range start/end changes)                      |
| `call.signal`     | `useCallSignaling.ts`, `IncomingCallModal.tsx` | Call signal state changes, answer/decline                                      |
| `crypto`          | `useKeyBackup.ts`                              | Key backup errors                                                              |
| `media`           | `ClientNonUIFeatures.tsx`                      | Blob cache stats on blob URL creation                                          |

## Implementation Details

### Files Modified

1. **`src/instrument.ts`**
   - Enhanced Sentry initialization with privacy controls
   - Added user preference checks
   - Improved data scrubbing for Matrix-specific data
   - Conditional session replay based on user settings

2. **`src/app/utils/debugLogger.ts`**
   - Added Sentry import
   - New `sendToSentry()` method for breadcrumbs and error capture
   - New `exportLogsForSentry()` method
   - New `attachLogsToSentry()` method
   - Integrated into main `log()` method

3. **`src/app/features/bug-report/BugReportModal.tsx`**
   - Added Sentry and debug logger imports
   - New state for Sentry options (`sendToSentry`, `includeDebugLogs`)
   - Enhanced `handleSubmit()` with Sentry user feedback
   - New UI checkboxes for Sentry options

4. **`src/app/features/settings/developer-tools/SentrySettings.tsx`** _(new file)_
   - New settings panel component
   - Controls for Sentry and session replay
   - Manual log attachment

5. **`src/app/features/settings/developer-tools/DevelopTools.tsx`**
   - Added SentrySettings import and component

### Sentry Configuration

- **Tracing sample rate**: 100% in development, 10% in production
- **Session replay sample rate**: 10% of all sessions, 100% of error sessions
- **Warning capture rate**: 10% to avoid overwhelming Sentry
- **Breadcrumb retention**: All breadcrumbs retained for context
- **Log attachment limit**: Last 100 debug log entries

### Performance Considerations

- Breadcrumbs are added synchronously but are low-overhead
- Error capture is asynchronous and non-blocking
- Warning sampling (10%) prevents excessive Sentry usage
- Session replay only captures when enabled by user
- Debug log attachment limited to most recent entries

## Usage Examples

### For Developers

```typescript
import { getDebugLogger } from '$utils/debugLogger';

// Errors are automatically sent to Sentry
const logger = createDebugLogger('myNamespace');
logger.error('sync', 'Sync failed', error); // Sent to Sentry

// Manually attach logs before capturing an error
const debugLogger = getDebugLogger();
debugLogger.attachLogsToSentry(100);
Sentry.captureException(error);
```

### For Users

1. **Report a bug with Sentry**:
   - Type `/bugreport` or click "Bug Report" button
   - Fill in the form
   - Check "Send anonymous report to Sentry"
   - Check "Include recent debug logs" for more context
   - Submit

2. **Disable Sentry**:
   - Go to Settings → Developer Tools
   - Enable Developer Tools
   - Scroll to "Error Tracking (Sentry)"
   - Toggle off "Enable Sentry Error Tracking"
   - Refresh the page

## Benefits

### For Users

- Better bug tracking and faster fixes
- Optional participation with privacy controls
- Transparent data usage

### For Developers

- Real-time error notifications
- Rich context with breadcrumbs and logs
- Performance monitoring
- User feedback integrated with errors
- Replay sessions to reproduce bugs

## Privacy Commitment

See [SENTRY_PRIVACY.md](./SENTRY_PRIVACY.md) for a complete, code-linked breakdown of what is collected, what is masked, and how user controls work.

In summary, all data sent to Sentry is:

- **Off by default**: Sentry is disabled until the user explicitly opts in
- **Anonymized**: No personal data or message content
- **Filtered**: Tokens, passwords, and IDs are redacted
- **Minimal**: Only error context and debug info
- **Transparent**: Users can see what's being sent

No message content, room conversations, or personal information is ever sent to Sentry.

## Testing

To test the integration:

1. **Test error reporting**:
   - Go to Settings → General → Diagnostics & Privacy
   - Check that Sentry is enabled and `VITE_SENTRY_DSN` is set
   - Open the browser console and run: `window.Sentry?.captureMessage('Test message')`
   - Check the Sentry dashboard for the event

2. **Test bug report integration**:
   - Type `/bugreport`
   - Fill in form with test data
   - Enable "Send anonymous report to Sentry"
   - Submit and check Sentry

3. **Test privacy controls**:
   - Disable Sentry in settings
   - Refresh page
   - Trigger an error (should not appear in Sentry)
   - Re-enable and verify errors are captured again

## Troubleshooting

### Sentry not capturing errors

1. Check that `VITE_SENTRY_DSN` is set
2. Check that Sentry is enabled in settings
3. Check browser console for Sentry initialization message
4. Verify network requests to Sentry are not blocked

### Sensitive data in reports

1. Check `beforeSend` hook in `instrument.ts`
2. Add new patterns to the scrubbing regex
3. Test with actual data to verify masking

### Performance impact

1. Reduce tracing sample rate in production
2. Disable session replay if not needed
3. Monitor Sentry quota usage
4. Adjust warning sampling rate

## Resources

- [Sentry React Documentation](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Sentry Error Monitoring Best Practices](https://docs.sentry.io/product/error-monitoring/)
- [Sentry Session Replay](https://docs.sentry.io/product/session-replay/)
- [Sentry User Feedback](https://docs.sentry.io/product/user-feedback/)
