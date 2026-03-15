---
default: patch
---

Fix event listener accumulation during sync retries: stable callback refs across RoomTimeline hooks, correct CallEmbed .bind(this) leak, and stable refs in useCallSignaling to prevent MaxListeners warnings
