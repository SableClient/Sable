---
default: patch
---

Keep upstream sync automation on one reusable sync branch per upstream/base pair so each new sync run updates the existing draft PR instead of opening a new dated PR, while still surfacing conflict details when manual resolution is needed.
