const IGNORED_MESSAGE_GESTURE_SELECTOR = '[data-gestures="ignore"]:not([data-message-swipe])';

export function shouldIgnoreMessageLongPress(target: Element | null | undefined): boolean {
  return target?.closest(IGNORED_MESSAGE_GESTURE_SELECTOR) !== null;
}
