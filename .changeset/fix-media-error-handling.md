---
default: patch
---

Fix intermittent 401 errors when loading media after service worker restart. Service worker now expires cached authentication tokens after 60 seconds, forcing fresh token retrieval from the active page instead of using potentially stale persisted tokens.
