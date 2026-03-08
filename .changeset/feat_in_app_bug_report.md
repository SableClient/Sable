---
sable: minor
---

feat: in-app bug report and feature request modal

Adds a `/bugreport` slash command and a "Report an Issue" button on the About settings page. Both open a modal where you fill out fields that mirror the repo's GitHub issue templates:

- **Bug Report**: description (required), steps to reproduce, expected behavior, platform/version info (auto-populated), and additional context
- **Feature Request**: problem description (required), desired solution (required), alternatives considered, and additional context

The title field searches for duplicate open issues as you type. Submitting opens the pre-filled GitHub new issue form in a new tab — no authentication required.
