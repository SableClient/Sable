---
default: patch
---

Read HTTP response bodies in one IPC round trip on desktop and mobile instead of one per body chunk, and enable gzip/brotli for homeserver traffic.
