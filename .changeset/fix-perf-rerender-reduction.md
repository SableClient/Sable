---
default: patch
---

Reduce unnecessary re-renders: memoize VList style in RoomTimeline, remove per-message UnreadNotifications listener from ThreadReplyChip, and reset presence state correctly when navigating between user profiles.
