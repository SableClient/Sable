---
default: patch
---

Suppress "Uncaught (in promise)" console noise for fire-and-forget `useAsyncCallback` call sites; errors are still surfaced to callers that await the returned promise and captured in `AsyncState`
