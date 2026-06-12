---
default: patch
---

Fix iOS PWA foreground lifecycle churn by avoiding forced sync retries, removing unused bfcache sync pause helpers, and stopping visibility-driven web pusher re-registration.
