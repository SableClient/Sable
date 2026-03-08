---
sable: patch
---

fix: notification delivery bugs

- **Push notifications always silent** — `resolveSilent` in the service worker now always returns `false`, leaving sound/vibration decisions entirely to the OS and Sygnal push gateway. The in-app sound setting no longer affects push sound.
- **In-app banner showing "sent an encrypted message"** — Events reaching the banner are already decrypted by the SDK. `isEncryptedRoom: false` is now passed so the actual message body is always shown when message content preview is enabled.
- **Desktop OS notifications not firing when page is hidden** — The OS notification block now runs before the `visibilityState !== 'visible'` guard, which only gates the in-app banner and audio. Notifications now fire even when the browser window is minimised.
- **iOS lock screen media player after notification sound** — `mediaSession.playbackState` is cleared after a short delay following `play()`, dismissing the lock screen widget. If in-app media has since registered its own metadata, the session is left untouched.
- **In-app banner not appearing on desktop** — The banner was gated behind a `mobileOrTablet()` check; it now fires on all platforms when In-App Notifications is enabled.
