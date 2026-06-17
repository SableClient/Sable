---
default: patch
---

Make Clear Cache & Reload fully reset browser caches and service-worker state so the app does not reopen with mixed old/new UI assets, and harden About update checks to fail gracefully when startup state is stale.
