---
default: minor
---

Add more hidden timeline events with settings and rendering.

#### Settings

- Add a master Show Hidden Events toggle with per-type sub-toggles for message edits, redactions, reactions, and other unrecognized events
- Sub-toggles stay visible beneath the master toggle and are disabled while hidden events are off
- Fold the redacted-message tombstone setting into the redactions group and migrate existing tombstone preferences

#### Timeline filtering and rendering

- Show message edits as timeline events with reply navigation and an inline word/line diff between versions
- Show reactions, message redactions, and reaction redactions as timeline events instead of message bubbles
- Keep redacted reactions in the timeline as tombstones with redaction events linking back to them when possible
- Improve reply-chip previews for edits, redactions, reactions, and redacted targets
- Merge related edit and reaction events into the timeline when they are missing from pagination

#### Safeguards

- Hide forward, delete, and other message actions on timeline meta events that cannot be forwarded or meaningfully deleted
- Disallow forwarding deleted messages and other non-message event types
