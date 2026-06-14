---
default: minor
---

Added more hidden timeline events with settings and rendering.

#### Settings

- Added a master Show Hidden Events toggle with per-type sub-toggles for message edits, redactions, reactions, and other unrecognized events
- Sub-toggles stay visible beneath the master toggle and are disabled while hidden events are off

#### Timeline rendering

- Show message edits as timeline events with reply navigation and an inline word/line diff between versions
- Show reactions, message redactions, and reaction redactions as timeline events
- Keep redacted reactions in the timeline as tombstones with redaction events linking back to them when possible
- Improve reply-chip previews for edits, redactions, reactions, and redacted targets

#### Safeguards

- Hide forward, delete, and other message actions on timeline meta events that cannot be forwarded or meaningfully deleted
- Disallow forwarding deleted messages and other non-message event types
