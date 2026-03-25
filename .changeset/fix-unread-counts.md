---
default: patch
---

Fix unread badge counts showing "1" for unvisited rooms by guarding fixupNotifications to only run for rooms where the user has a read receipt.
