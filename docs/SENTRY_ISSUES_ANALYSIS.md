# Sentry Issues Analysis & Fixes

Analysis and fixes for active Sentry issues. Commit: `514f067c6`

---

## Issue 1: Presence Rate Limiting (SABLE-59) ✅ FIXED

### Problem

PUT requests to `/_matrix/client/v3/presence/{userId}/status` returning HTTP 429 Too Many Requests.

### Root Cause

The existing code had 429 detection and retry-after parsing, but **failed to retry** after the backoff. When a 429 occurred:

1. Error caught ✓
2. Retry-After header parsed ✓
3. Sleep for backoff duration ✓
4. Update `lastSentTimestamp` ✓
5. **Return immediately** ✗ ← presence update was lost

### Fix

Added retry loop with exponential backoff (up to 3 retries):

- Detects 429 responses
- Respects `retry_after_ms` from server response
- Retries the request after backoff
- Updates Sentry telemetry with retry count
- Falls back to 5000ms if server doesn't provide retry-after

**Code location**: [src/app/hooks/usePresenceSync.ts](src/app/hooks/usePresenceSync.ts#L342-L386)

**Behavior**:

- Retry 1: Wait for server-provided `retry_after_ms`, retry
- Retry 2: Wait again, retry
- Retry 3: Wait again, retry
- If all retries exhausted: log error and give up (prevents infinite loop)

---

## Issue 2: Worker MIME Type Error (SABLE-5K) ⚠️ NO CODE CHANGES

### Problem

`TypeError: 'text/html' is not a valid JavaScript MIME type` when loading the search worker.

### Root Cause

**Stale cached index.html** referencing old worker URLs after deployment. When:

1. New version deployed with updated worker script paths
2. User has old `index.html` cached in browser
3. Old HTML tries to load worker from old path → 404
4. Server returns HTML error page instead of JS
5. Browser tries to parse HTML as JavaScript → MIME type error

### Analysis

Existing error handling is appropriate:

- Worker instantiation wrapped in try-catch ✓
- MIME errors detected and flagged ✓
- Sentry telemetry includes detailed context ✓
- Error doesn't crash app (search just unavailable) ✓

**Code location**: [src/app/hooks/useSearchIndex.tsx](src/app/hooks/useSearchIndex.tsx#L662-L703)

### Recommendation

**This is a cache invalidation issue, not a code bug**. Cannot be fixed in code.

**User mitigation**: Hard reload (Cmd+Shift+R / Ctrl+Shift+R)

**Server mitigation options** (not implemented in this commit):

1. Set aggressive cache headers on `index.html` (`Cache-Control: no-cache`)
2. Implement service worker cache busting for HTML
3. Add build-time hash to worker script URLs (Vite already does this via `?worker` suffix)

---

## Issue 3: Crypto Store IndexedDB Errors ⚠️ MITIGATED (SDK-level issue)

### Problem

Intermittent IndexedDB transaction errors causing `/sync` to fail:

1. `DomException UnknownError (0): Attempt to get a record from database without an in-progress transaction`
2. `DomException InvalidStateError (11): Failed to execute 'transaction' on 'IDBDatabase': The database connection is closed`

### Root Cause

Errors originate in the **matrix-rust-sdk-crypto WASM layer** (part of matrix-js-sdk), which we don't control. Suspected race conditions:

- Transaction timing issues in WASM crypto operations
- IDB connection closed prematurely during crypto operations
- Concurrent crypto store access from multiple async paths

### Fix

**Enhanced error detection and telemetry**:

- Added crypto-store-specific error detection in sync error handlers (both classic and sliding sync)
- Errors are now categorized and tagged in Sentry for better debugging
- Metrics track `crypto_store_error: true` for filtering
- Extra context includes recovery recommendations

**Code locations**:

- Classic sync: [src/client/initMatrix.ts](src/client/initMatrix.ts#L663-L712)
- Sliding sync: [src/client/slidingSync.ts](src/client/slidingSync.ts#L469-L515)

### Behavior

When these errors occur:

1. Detected via error message pattern matching
2. Logged to Sentry with `component: crypto-store` tag
3. Sync enters `SyncState.Error` or `SyncState.Reconnecting`
4. Matrix SDK automatically retries sync after backoff
5. User sees temporary connection disruption, then recovers

### Limitations

**Cannot fix root cause** (SDK-level WASM issue). This fix only improves visibility and monitoring.

### Potential Future Work

If errors persist at high volume, consider:

1. Matrix SDK upgrade (check if newer versions fix WASM crypto issues)
2. Force sync restart on repeated crypto store errors
3. Add IDB connection health checks before crypto operations
4. Report to matrix-js-sdk maintainers with Sentry data

---

## Testing Recommendations

### Presence Rate Limiting

Monitor Sentry for:

- `Presence rate limited` message frequency
- Check `retryCount` in extra context (should be 1-3)
- Verify successful retry after backoff (no more "dropped update" patterns)

### Crypto Store Errors

Monitor Sentry for:

- `Crypto store IndexedDB error during sync` message
- Check `error_type` tag (transaction_error vs connection_closed)
- Verify sync recovery (users shouldn't get stuck in error state)

### Worker MIME Type

Monitor Sentry for:

- `Search worker failed to instantiate` errors
- Check `is_mime_error: true` and `likely_stale_cache: true`
- High spike after deployments suggests cache invalidation strategy needed
