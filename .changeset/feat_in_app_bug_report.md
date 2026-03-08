---
sable: minor
---

feat: in-app bug report and feature request modal

Adds a `/report` slash command and a "Report an Issue" button on the About settings page. Both open a modal with a type selector (Bug Report / Feature Request), a title field with debounced GitHub issue search for duplicate detection, description and type-specific fields, and auto-populated platform/version info. Submitting opens the pre-filled GitHub new issue page in a new tab — no authentication required.
