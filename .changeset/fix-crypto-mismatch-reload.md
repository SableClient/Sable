---
default: patch
---

Fix devices randomly becoming unverified: clear the account's crypto stores on forced logout, and reload instead of retrying in place after a store mismatch.
