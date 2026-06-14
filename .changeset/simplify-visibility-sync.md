---
default: patch
---

Simplify app visibility handling by removing automatic foreground sync retries and focus/online service-worker session resyncs, and delay the reconnecting banner so short resume reconnects do not alarm users.
