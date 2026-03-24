/**
 * Centralized access to the Sentry opt-in preference stored in localStorage.
 *
 * These must be plain functions (not Jotai atoms) because src/instrument.ts
 * reads them synchronously at module load time, before React and Jotai mount.
 * All other callers should import from here instead of using raw localStorage.
 */

export const SENTRY_ENABLED_KEY = 'sable_sentry_enabled';
export const SENTRY_REPLAY_ENABLED_KEY = 'sable_sentry_replay_enabled';

/** Returns true if the user has opted in to error reporting. */
export const getSentryEnabled = (): boolean => localStorage.getItem(SENTRY_ENABLED_KEY) === 'true';

/** Returns true if the user has ever made a decision (opted in or out). */
export const isSentryDecided = (): boolean => localStorage.getItem(SENTRY_ENABLED_KEY) !== null;

/** Persist the user's error reporting preference. */
export const setSentryEnabled = (enabled: boolean): void => {
  localStorage.setItem(SENTRY_ENABLED_KEY, String(enabled));
};

/** Returns true if the user has opted in to session replay. */
export const getSentryReplayEnabled = (): boolean =>
  localStorage.getItem(SENTRY_REPLAY_ENABLED_KEY) === 'true';

/** Persist the user's session replay preference. */
export const setSentryReplayEnabled = (enabled: boolean): void => {
  if (enabled) {
    localStorage.setItem(SENTRY_REPLAY_ENABLED_KEY, 'true');
  } else {
    localStorage.removeItem(SENTRY_REPLAY_ENABLED_KEY);
  }
};
