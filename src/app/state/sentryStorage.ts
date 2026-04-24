/**
 * Centralized access to the Sentry opt-in preference stored in localStorage.
 *
 * These must be plain functions because src/instrument.ts reads them
 * synchronously at module load time, before React and Jotai mount.
 */

export const SENTRY_ENABLED_KEY = 'sable_sentry_enabled';
export const SENTRY_REPLAY_ENABLED_KEY = 'sable_sentry_replay_enabled';

export const getSentryEnabled = (): boolean => localStorage.getItem(SENTRY_ENABLED_KEY) === 'true';

export const isSentryDecided = (): boolean => localStorage.getItem(SENTRY_ENABLED_KEY) !== null;

export const setSentryEnabled = (enabled: boolean): void => {
  localStorage.setItem(SENTRY_ENABLED_KEY, String(enabled));
};

export const getSentryReplayEnabled = (): boolean =>
  localStorage.getItem(SENTRY_REPLAY_ENABLED_KEY) === 'true';

export const setSentryReplayEnabled = (enabled: boolean): void => {
  if (enabled) {
    localStorage.setItem(SENTRY_REPLAY_ENABLED_KEY, 'true');
  } else {
    localStorage.removeItem(SENTRY_REPLAY_ENABLED_KEY);
  }
};
