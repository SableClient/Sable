---
default: patch
---

Tighten sliding sync memory management: stop the polling loop on client dispose, persist then prune large room timelines when leaving a room, remove adaptive timeline-limit logic, and auto-unsubscribe when the local user leaves or is banned from a room.
