---
default: patch
---

Fix blank room timeline when app returns from background. When sliding sync delivers an `initial: true` response for the open room, a `TimelineReset` event now correctly shows skeleton placeholders while events reload instead of leaving an empty view.
