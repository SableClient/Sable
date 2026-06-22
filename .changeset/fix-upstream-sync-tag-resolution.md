---
default: patch
---

Fix the upstream sync workflow so scheduled and manual sync runs can fetch upstream tags without clobbering fork tags, correctly resolve upstream tag refs to their underlying commits, and still open a draft sync PR when the merge needs manual conflict resolution.
