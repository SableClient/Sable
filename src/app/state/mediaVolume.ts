/**
 * Centralized access to the persisted media volume preference.
 *
 * Plain functions rather than a Jotai atom because the value is applied
 * directly to DOM element refs, not read reactively in JSX.
 */

const MEDIA_VOLUME_KEY = 'mediaVolume';

/** Returns the persisted volume (0–1), or undefined if never set. */
export const getMediaVolume = (): number | undefined => {
  const stored = localStorage.getItem(MEDIA_VOLUME_KEY);
  if (stored === null) return undefined;
  const parsed = parseFloat(stored);
  return Number.isNaN(parsed) ? undefined : parsed;
};

/** Persist the current volume (0–1). */
export const setMediaVolume = (volume: number): void => {
  localStorage.setItem(MEDIA_VOLUME_KEY, String(volume));
};
