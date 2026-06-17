---
default: patch
---

Harden startup, notification routing, and service-worker recovery by guarding passive web-push reconciliation on unsupported browsers, preserving `/to/...` deep-link restores across login and notification flows, fixing background notification client teardown, improving notification-click recovery after app restarts, and adding smoke coverage for startup and session-restore paths.
