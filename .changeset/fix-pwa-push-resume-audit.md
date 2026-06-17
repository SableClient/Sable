---
default: patch
---

Harden PWA push and resume recovery by restoring lazy service-worker reclaim on foreground return, re-arming web push on startup, routing room notification restores through the canonical `/to/...` deep-link path, and adding telemetry that distinguishes warm resume from cold launch after notification clicks.
