---
default: patch
---

Fix timeline pagination lock bug, deduplicate concurrent URL preview requests, and remove redundant sliding sync spidering call causing N+1 requests.
