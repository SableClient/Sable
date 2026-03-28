---
default: patch
---

Fix timeline pagination lock bug, deduplicate concurrent URL preview requests, remove redundant sliding sync spidering call causing N+1 requests, fix scroll-to-bottom not working after room navigation (stale-room liveTimelineLinked guard + deferred ready on empty processedEvents), and fix wrong timeline chain used for pagination count comparisons after a sliding sync reset.
