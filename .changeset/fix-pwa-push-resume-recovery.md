---
default: patch
---

Keep web push registered across visibility changes, and let the service worker suppress OS notifications only when a controlled page proves it is actively foregrounded. This also preserves the resumed-PWA media/session recovery work so push and authenticated fetches do not silently fail after the app is suspended or restored.
