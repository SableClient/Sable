---
'charm': patch
---

fix(search): keep paging server results when a `has:` type or quoted exact-match filter empties earlier pages, so a text search combined with `has:image`/`has:file`/etc. no longer stalls on "No results" while more matches remain
