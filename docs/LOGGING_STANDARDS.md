# Sable Logging Standards

Comprehensive guide for logging practices across the Sable codebase.

## Overview

Sable uses a structured logging system with two primary utilities:

1. **Simple Logger** (`createLogger`) - For basic debug logging
2. **Enhanced Logger** (`createDebugLogger`) - For categorized logging with Sentry integration

## When to Use Each Logger

### Use `createLogger` for:

- Simple debug output during development
- Performance-critical code where overhead matters
- Service Worker logging (SW context doesn't have full debugLogger)
- Quick troubleshooting that won't be committed

### Use `createDebugLogger` for:

- Production logging that helps diagnose user issues
- Error tracking and warning messages
- Feature-specific debug logs
- Any log that should integrate with Sentry

## Standard Log Prefixes

### Service Worker Logs

All Service Worker logs use `console.debug` with the `[SW]` prefix:

```typescript
console.debug('[SW] Prefetching sliding sync data...');
console.debug('[SW] Media fetch failed, falling through:', error);
console.warn('[SW fetchRawEvent] HTTP', res.status, 'for', eventId);
```

**Format:** `[SW]` or `[SW functionName]`

### Search Worker Logs

Search worker logs use `[SearchWorker]`:

```typescript
console.error('[SearchWorker] INIT failed:', err);
console.warn('[SearchWorker] IDB connection closed:', dbName);
```

### Application Logs

Application logs should use `createDebugLogger` with appropriate categories:

```typescript
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('featureName');

// Usage
debugLog.log('info', 'sync', 'Connection established', { userId });
debugLog.log('error', 'network', 'Request failed', error);
debugLog.log('warn', 'timeline', 'Event missing', { roomId, eventId });
```

### Debug Logs (Temporary)

Temporary debug logs for development use consistent category prefixes:

```typescript
console.log('[CATEGORY-DEBUG:component]', { data });
```

**Examples:**

- `[BADGE-DEBUG:SpaceTabs]` - Space badge calculation
- `[BADGE-DEBUG:getRoomsUnread]` - Unread map queries
- `[BADGE-DEBUG:init]` - Atom initialization

**Important:** These should be removed before merging to `dev`.

## Log Categories

The `createDebugLogger` system uses these categories (defined in `debugLogger.ts`):

- `sync` - Sync state, sliding sync, classic sync
- `network` - HTTP requests, API calls, connectivity
- `notification` - Push notifications, notification handling
- `message` - Message sending, receiving, rendering
- `call` - Voice/video calls, call widgets
- `ui` - UI interactions, rendering issues
- `timeline` - Timeline loading, pagination, events
- `search` - Search indexing, querying
- `idb` - IndexedDB operations
- `worker` - Web worker communication
- `storage` - LocalStorage, storage management
- `crypto` - E2E encryption, verification
- `media` - Media loading, thumbnails, attachments
- `auth` - Authentication, login, session management
- `error` - Unhandled errors, exceptions
- `general` - Uncategorized logs

## Best Practices

### DO

✅ Use appropriate log levels:

- `debug` - Verbose information for troubleshooting
- `info` - Normal operation, state changes
- `warn` - Unexpected but recoverable situations
- `error` - Errors that require attention

✅ Include relevant context data:

```typescript
debugLog.log('error', 'timeline', 'Failed to load events', {
  roomId,
  eventCount,
  error: error.message,
});
```

✅ Use descriptive messages:

```typescript
// Good
console.debug('[SW] Prefetching sliding sync data...');

// Bad
console.debug('[SW] Fetch...');
```

✅ Scrub sensitive data before logging:

```typescript
// Use the scrubbing utilities from sentryScrubbers.ts
import { scrubMatrixIds, scrubMatrixUrl } from '$utils/sentryScrubbers';
```

### DON'T

❌ Log access tokens, passwords, or encryption keys
❌ Log full Matrix event content without scrubbing
❌ Use inconsistent prefixes (`[component]`, `[Component]`, `component:`)
❌ Log in tight loops without rate limiting
❌ Mix log utilities in the same file

## Migration Guide

### Migrating from Raw Console Logs

**Before:**

```typescript
console.log('Loading room', roomId);
console.warn('Failed to load:', error);
```

**After:**

```typescript
const debugLog = createDebugLogger('roomLoader');

debugLog.log('info', 'timeline', 'Loading room', { roomId });
debugLog.log('warn', 'timeline', 'Failed to load', { roomId, error });
```

### Migrating from Simple Logger

**Before:**

```typescript
const log = createLogger('featureName');
log.warn('Something went wrong');
```

**After:**

```typescript
const debugLog = createDebugLogger('featureName');
debugLog.log('warn', 'general', 'Something went wrong');
```

## Sentry Integration

Logs from `createDebugLogger` automatically integrate with Sentry:

- **Errors** - Always sent to Sentry as events
- **Warnings** - Sampled at 10% to avoid quota exhaustion
- **Info/Debug** - Included as breadcrumbs (can be filtered per-category in Settings)

Users can control which categories create Sentry breadcrumbs in:
**Settings → Developer Tools → Error Tracking (Sentry)**

## Temporary Debug Logging

When adding temporary debug logs for investigating specific issues:

1. Use a consistent `[CATEGORY-DEBUG:component]` prefix
2. Document the purpose in a comment
3. Remove before merging to `dev` (or create a follow-up task)

Example:

```typescript
// TODO: Remove after investigating space badge visibility issue
console.log('[BADGE-DEBUG:SpaceTabs]', {
  spaceName: space.name,
  allUnread,
  loudUnread,
});
```

## Performance Considerations

- `createLogger` logs are no-op in production unless `sable_debug` is enabled
- `createDebugLogger` only logs errors/warnings in production unless `sable_internal_debug` is enabled
- Service Worker logs use `console.debug` which can be filtered in DevTools
- Sentry breadcrumbs have minimal overhead (~1-2ms per log)

## Testing Logs

When writing tests, you can suppress console output:

```typescript
import { vi } from 'vitest';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
```

Or assert on log calls:

```typescript
const logSpy = vi.spyOn(console, 'log');
// ... perform action ...
expect(logSpy).toHaveBeenCalledWith('[BADGE-DEBUG:init]', expect.any(Object));
```

## Examples from Codebase

### Service Worker

```typescript
// src/sw.ts
console.debug('[SW] Prefetching sliding sync data...');
console.warn('[SW fetchRawEvent] HTTP', res.status, 'for', eventId);
```

### Matrix Client Init

```typescript
// src/client/initMatrix.ts
const log = createLogger('initMatrix');
const debugLog = createDebugLogger('initMatrix');

log.log('Starting Matrix client...');
debugLog.log('info', 'sync', 'Client started', { transport });
```

### Timeline Component

```typescript
// Example component
const debugLog = createDebugLogger('Timeline');

useEffect(() => {
  debugLog.log('info', 'timeline', 'Loading room timeline', { roomId });

  try {
    // ... load timeline ...
  } catch (error) {
    debugLog.log('error', 'timeline', 'Failed to load timeline', { roomId, error });
  }
}, [roomId]);
```

## Configuration

### Enable Debug Logging

**Simple Logger:**

```javascript
localStorage.setItem('sable_debug', '1');
location.reload();
```

**Enhanced Logger:**

```javascript
localStorage.setItem('sable_internal_debug', '1');
location.reload();
```

**Or via Settings UI:**
Settings → Developer Tools → Debug Logs → Enable Enhanced Debug Logger

### Disable Sentry Breadcrumb Categories

Settings → Developer Tools → Error Tracking (Sentry) → Breadcrumb Categories

## References

- `src/app/utils/debug.ts` - Simple logger implementation
- `src/app/utils/debugLogger.ts` - Enhanced logger implementation
- `src/app/utils/sentryScrubbers.ts` - Data scrubbing utilities
- `src/instrument.ts` - Sentry configuration
- `docs/SENTRY_INTEGRATION.md` - Sentry integration guide
