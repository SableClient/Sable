type KeyboardCloseArgs = {
  heightDelta: number;
  isKeyboardVisible: boolean;
  prevKeyboardHeight: number;
  prevKeyboardVisible: boolean;
};

export const didKeyboardJustClose = ({
  heightDelta,
  isKeyboardVisible,
  prevKeyboardHeight,
  prevKeyboardVisible,
}: KeyboardCloseArgs): boolean =>
  prevKeyboardVisible &&
  !isKeyboardVisible &&
  heightDelta > 0 &&
  prevKeyboardHeight > 0 &&
  Math.abs(heightDelta - prevKeyboardHeight) < 50;

export const shouldRepinBottomAfterKeyboardClose = (
  keyboardJustClosed: boolean,
  keyboardSessionWasBottomPinned: boolean,
  isCurrentlyAtBottom: boolean
): boolean => keyboardJustClosed && keyboardSessionWasBottomPinned && isCurrentlyAtBottom;

export const didKeyboardJustOpen = (
  isKeyboardVisible: boolean,
  previousKeyboardVisible: boolean
): boolean => isKeyboardVisible && !previousKeyboardVisible;

export const shouldClearKeyboardBottomSessionOnUserIntent = (
  source: 'pointerdown' | 'wheel' | 'touchmove' | 'keyboard',
  isKeyboardVisible: boolean
): boolean => isKeyboardVisible && source !== 'pointerdown';

export const isKeyboardBottomSessionScrollKeyTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return true;
  if (target.isContentEditable || target.getAttribute('contenteditable') === 'true') return false;
  return !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
};
