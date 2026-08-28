---
default: patch
---

Fix avatars flickering and sometimes staying broken: a retry now re-requests the image on the web, loads without dropping the fallback, and stays cached once it succeeds.
