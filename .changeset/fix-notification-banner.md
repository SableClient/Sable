---
sable: patch
---

fix: in-app notification banner placement

Render `NotificationBanner` in `ClientLayout` so it occupies the full viewport width as `position: fixed` and doesn't displace any page content. Previously it was rendered inside `Room.tsx`, which caused layout shift and meant it only appeared while a room was open.
