# Timeline Fixes Needed

This document tracks timeline-related issues that need to be addressed in `feat/timeline`.

## Issue #3: Multiple jumps when navigating to messages in history

**Problem**: Jumping to specific messages, especially in history, jumps multiple times (probably as part of loading history), settles, then refreshes, and the message highlighting ends after that reload.

**Root Cause**: 
- Timeline pagination loading more messages causes the scroll position to recalculate
- Multiple render cycles as history loads
- Event highlighting is lost during re-renders

**Proposed Fix**:
- Implement stable scroll anchoring during history pagination
- Preserve highlight state across re-renders
- Debounce scroll adjustments during history load

## Issue #4: Visual reload when opening rooms  

**Problem**: Opening rooms results in a very obvious visual reload of the content.

**Root Cause**:
- Timeline fully re-renders when switching rooms
- Initial render before data is ready causes flash

**Proposed Fix**:
- Implement skeleton/loading state for timeline
- Preload timeline data before transition
- Use React.memo and stable keys to prevent unnecessary re-renders

## Issue #7: DM list room icons reload every time you open the DM list

**Problem**: In the DM list, the room icons reload every time you open the DM list - very jarring.

**Root Cause**:
- Avatar URLs being recomputed on every render
- No caching of avatar blobs
- Component remounts instead of staying mounted

**Proposed Fix**:
- Implement stable avatar URL memoization
- Keep DM list mounted but hidden when not visible
- Cache avatar data in blob cache

## Issue #8: Timeline content doesn't load until interaction

**Problem**: Sometimes content in the timeline doesn't load until interacting with it.

**Root Cause**:
- Lazy loading not triggered properly
- Virtual scrolling viewport detection issues
- Timeline subscription not activating

**Proposed Fix**:
- Review intersection observer setup
- Ensure timeline subscription activates on mount
- Add fallback eager loading for visible viewport
