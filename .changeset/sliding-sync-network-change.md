---
default: patch
---

Avoid aborting sliding-sync requests for online-only network change events; retry immediately only after a real offline-to-online transition.
