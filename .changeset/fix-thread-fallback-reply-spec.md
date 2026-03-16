---
default: patch
---

Fix thread messages to include the required `m.in_reply_to` fallback pointing to the latest thread event, so unthreaded clients can display the reply chain correctly per the Matrix spec.
