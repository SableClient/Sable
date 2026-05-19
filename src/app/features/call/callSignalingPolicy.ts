/** Shared timing policy for call signaling, notifications, and membership fallback. */
export const MAX_NOTIFICATION_LIFETIME_MS = 120_000;
export const DECRYPT_TIMEOUT_MS = 8_000;
export const FALLBACK_INTERVAL_MS = 5_000;
export const OUTGOING_RING_TIMEOUT_MS = 30_000;
/** Grace window before clearing incoming call when membership lags behind RTC notification. */
export const INCOMING_MEMBERSHIP_GRACE_MS = 15_000;
/** Delay before clearing embed after outgoing decline hangup completes. */
export const OUTGOING_DECLINE_EMBED_CLEAR_MS = 2_000;
