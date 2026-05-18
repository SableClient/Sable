# Notifications & Service Worker Fixes

This document tracks notification and service worker issues that need to be addressed in `feat/notifications`.

## Issue #2: SW connection dropout after idle period

**Problem**: The service worker doesn't seem to stay connected after a period of time, causing notifications to fail.

**Root Cause**:

- Service worker becomes inactive after idle period
- Push subscription may expire or lose connection
- Background sync registration not persisting
- SW messaging channel disconnected after tab becomes inactive

**Proposed Fix**:

- Implement periodic SW keepalive ping from active tabs
- Re-establish push subscription on SW activation
- Add SW connection health monitoring
- Implement exponential backoff reconnection logic
- Persist notification state in IndexedDB for SW access

**Implementation Notes**:

- Add `postMessage` keepalive every 30s from active tab
- Listen for SW `activate` event to restore connections
- Use `navigator.serviceWorker.ready` to ensure registration
- Test with Chrome DevTools → Application → Service Workers → "Update on reload" disabled

## Issue #5: Media loading failures until hard reset

**Problem**: Loading media (either media I just sent, or other media), including URL previews, fails until the app is hard reset.

**Root Cause**:

- Media authentication tokens not being refreshed/passed correctly
- CORS issues with media URLs after session changes
- Service worker caching stale auth headers
- Blob URL revocation before media loads

**Proposed Fix**:

- Implement media auth token refresh mechanism
- Clear SW media cache on auth token changes
- Add retry logic with fresh auth for media requests
- Use stable blob URLs with reference counting
- Add authentication headers to media fetch requests in SW

**Implementation Notes**:

- Store media auth tokens in SW cache with expiry
- Listen for Matrix client auth token changes
- Invalidate SW media cache on token refresh
- Add `Authorization` header to fetch requests in SW
- Test with private media enabled homeserver

## Issue #6: Phantom unread favicon badges/dots

**Problem**: There are phantom unread favicon badges/dots that don't correspond to actual unread messages.

**Root Cause**:

- Unread count calculation includes muted/low-priority rooms
- Favicon update race condition with sync state
- Notification count not clearing after room visit
- Thread notifications counting separately from main timeline

**Proposed Fix**:

- Recalculate unread count from room notification state only
- Exclude muted rooms and low-priority notifications
- Clear favicon badge immediately on room focus
- Consolidate thread + main timeline counts correctly
- Add debouncing to favicon updates during rapid sync

**Implementation Notes**:

- Use `room.getUnreadNotificationCount()` with proper filters
- Check `room.notificationCounts` and respect notification level
- Update favicon only when total unread count actually changes
- Test with various notification settings (All, Mentions, Muted)

**Related Files**:

- Service worker message handling
- Push notification registration
- Favicon update logic
- Media authentication
- Notification badge counting
