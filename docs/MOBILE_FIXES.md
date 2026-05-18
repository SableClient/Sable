# Mobile UX Fixes

This document tracks mobile-specific issues that need to be addressed in `feat/mobile`.

## Issue #9: iOS keyboard show/hide triggers jump button

**Problem**: Sometimes when opening/closing the keyboard on iOS, the jump to present button is displayed incorrectly.

**Root Cause**:
- iOS viewport height changes when keyboard appears/disappears
- Virtual keyboard causes viewport resize events
- Timeline scroll position calculation doesn't account for keyboard state
- Jump button visibility logic triggers on viewport changes

**Proposed Fix**:
- Detect iOS virtual keyboard state changes
- Exclude keyboard-triggered viewport changes from jump button logic
- Use `visualViewport` API instead of window.innerHeight on iOS
- Debounce jump button visibility checks during keyboard transitions
- Store keyboard state and ignore scroll position during keyboard animation

**Implementation Notes**:
- Use `window.visualViewport.height` vs `window.innerHeight` to detect keyboard
- Listen to `visualViewport` resize events
- Add keyboard state to timeline context
- Filter out scroll events during keyboard animation (~300ms)

**Related Files**:
- Timeline scroll handling
- Jump to present button logic
- iOS-specific viewport handling
