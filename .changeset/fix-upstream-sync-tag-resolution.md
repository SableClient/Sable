---
default: patch
---

Fix the upstream sync workflow so scheduled and manual sync runs can fetch upstream tags without clobbering fork tags, and correctly resolve annotated upstream tags to their underlying commits.
