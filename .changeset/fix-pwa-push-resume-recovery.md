---
default: patch
---

Keep web push registered across visibility changes, and only defer page notifications to push when a usable push transport is actually ready. This also preserves the resumed-PWA media/session recovery work so push and authenticated fetches do not silently fail after the app is suspended or restored.
