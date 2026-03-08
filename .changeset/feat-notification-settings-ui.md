---
sable: minor
---

feat: notification settings page improvements

- Rename "Mobile In-App Notifications" → "In-App Notifications"; show the toggle on all platforms.
- Rename "Notification Sound" → "In-App Notification Sound" to clarify it only controls in-page audio, not push sound.
- Move badge display settings (Show Unread Counts, Badge Counts for DMs Only, Show Unread Ping Counts) from Appearance into the Notifications page.
- Fix "System Notifications" description — remove incorrect claim that mobile uses the in-app banner instead.
- Add a notification levels info button (ⓘ) to the All Messages, Special Messages, and Keyword Messages section headings explaining Disable / Notify Silent / Notify Loud.
- Add descriptive text under each notification section heading.
- Collapse the two `@room` push rules into a single "Mention @room" control (routes to `IsRoomMention` on modern servers, `AtRoomNotification` on older servers). Showing them separately caused an apparent sync loop where setting one immediately reset the other.
- Add "Follows your global notification rules" subtitle to the "Default" option in the per-room notification switcher.
