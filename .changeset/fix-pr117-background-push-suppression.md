---
default: patch
---

Require a recent live foreground heartbeat before the service worker suppresses OS push notifications, so stale Safari or PWA pages cannot incorrectly silence background push delivery.
