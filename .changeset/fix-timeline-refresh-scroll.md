---
default: patch
---

Fix spurious scroll-to-bottom and MaxListeners warnings on sync gap: stable callback refs and prevEventsLength guard in RoomTimeline, correct CallEmbed .bind(this) listener leak, stable refs in useCallSignaling, and unreadInfoRef to stop per-message listener churn
