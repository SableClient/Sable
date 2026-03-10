---
default: minor
---

Add adaptive background pagination for improved message history availability. When entering a room, the app now proactively loads additional message history in the background based on device capabilities (high-end: 500 messages, medium: 250 messages, low-end/mobile: 100 messages) without blocking the initial room load. Uses the same adaptive detection logic as sliding sync for consistency.
