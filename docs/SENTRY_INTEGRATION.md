# Sentry Integration for Sable

This document describes the Sentry error tracking and monitoring integration added to Sable.

## Overview

Sentry is integrated with Sable to provide:
- **Error tracking**: Automatic capture and reporting of errors and exceptions
- **Performance monitoring**: Track application performance and identify bottlenecks
- **User feedback**: Collect bug reports with context from users
- **Session replay**: Record user sessions (with privacy controls) for debugging
- **Breadcrumbs**: Track user actions leading up to errors
- **Debug log integration**: Attach internal debug logs to error reports

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
- **Privacy controls**: Users can opt-out of Sentry reporting

Integration points:
- `src/app/features/bug-report/BugReportModal.tsx` - Added Sentry options and submission logic
- Automatically attaches platform info, version, and user agent
- Links bug reports to Sentry events for tracking

### 4. Privacy & Security

Comprehensive data scrubbing:
- **Token masking**: All access tokens, passwords, and authentication data are redacted
- **Matrix ID anonymization**: User IDs, room IDs, and event IDs are masked
- **Session replay privacy**: All text, media, and form inputs are masked when replay is enabled
- **request header sanitization**: Authorization headers are removed
- **User opt-out**: Users can disable Sentry entirely via settings

Sensitive patterns automatically redacted:
- `access_token`, `password`, `token`, `refresh_token`
- `session_id`, `sync_token`, `next_batch`
- Matrix user IDs (`@user:server`)
- Matrix room IDs (`!room:server`)
- Matrix event IDs (`$event_id`)

### 5. Settings UI

New Sentry settings panel in Developer Tools:
- **Enable/disable Sentry**: Toggle error tracking on/off
- **Session replay control**: Enable/disable session recording
- **Test error reporting**: Send test errors to verify configuration
- **Test feedback**: Send test feedback messages
- **Attach debug logs**: Manually attach recent logs to next error

Access via: Settings → Developer Tools → Error Tracking (Sentry)

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
Environment    | Traces | Session Replay | Error Replay
---------------|--------|----------------|-------------
production     | 10%    | 10%            | 100%
preview        | 100%   | 100%           | 100%
development    | 100%   | 100%           | 100%
```

### User Preferences

Users can control Sentry via localStorage:

```javascript
// Disable Sentry entirely (requires page refresh)
localStorage.setItem('sable_sentry_enabled', 'false');

// Disable session replay only (requires page refresh)
localStorage.setItem('sable_sentry_replay_enabled', 'false');
```

Or use the UI in Settings → Developer Tools → Error Tracking (Sentry).

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
   - Test buttons for error reporting and feedback
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

All data sent to Sentry is:
- **Opt-in by default** but can be disabled
- **Anonymized**: No personal data or message content
- **Filtered**: Tokens, passwords, and IDs are redacted
- **Minimal**: Only error context and debug info
- **Transparent**: Users can see what's being sent

No message content, room conversations, or personal information is ever sent to Sentry.

## Future Enhancements

Potential improvements:
- [ ] Add performance metrics to Sentry settings
- [ ] More granular control over breadcrumb categories
- [ ] Export Sentry reports as JSON for offline analysis
- [ ] Integration with internal metrics dashboard
- [ ] Automatic source map upload for better stack traces
- [ ] Custom Sentry tags from user preferences
- [ ] Rate limiting per user/session

## Testing

To test the integration:

1. **Test error reporting**:
   - Go to Settings → Developer Tools → Error Tracking
   - Click "Send Test Error"
   - Check Sentry dashboard for the error

2. **Test feedback**:
   - Click "Send Test Feedback"
   - Check Sentry feedback section

3. **Test bug report integration**:
   - Type `/bugreport`
   - Fill in form with test data
   - Enable "Send anonymous report to Sentry"
   - Submit and check Sentry

4. **Test privacy controls**:
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
