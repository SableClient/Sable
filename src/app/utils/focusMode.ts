import type { Settings } from '$state/settings';

export type FocusMode = 'off' | 'focus' | 'dnd';

/**
 * Determines if a notification or badge should be shown based on the current focus mode.
 *
 * Focus Mode rules:
 * - DMs: always show
 * - Rooms: only show if highlight/mention
 *
 * Do Not Disturb rules:
 * - DMs: only show if highlight/mention
 * - Rooms: only show if highlight/mention
 *
 * Off: no filtering, show everything according to existing settings
 *
 * @param focusMode The current focus mode setting
 * @param isDM Whether this is a direct message room
 * @param isHighlight Whether this notification is for a highlight (mention/keyword)
 * @returns true if the notification/badge should be shown, false if filtered out
 */
export function shouldShowNotificationInFocusMode(
  focusMode: FocusMode,
  isDM: boolean,
  isHighlight: boolean
): boolean {
  if (focusMode === 'off') return true;

  if (focusMode === 'focus') {
    // Focus: show all DMs, only highlights from rooms
    return isDM || isHighlight;
  }

  if (focusMode === 'dnd') {
    // DND: only show DM highlights or room highlights
    return isHighlight;
  }

  return true;
}

/**
 * Hook-friendly wrapper that reads focus mode from settings atom
 */
export function useFocusModeFilter(settings: Settings) {
  return (isDM: boolean, isHighlight: boolean) =>
    shouldShowNotificationInFocusMode(settings.focusMode, isDM, isHighlight);
}
