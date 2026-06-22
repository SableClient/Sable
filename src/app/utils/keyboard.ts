import { isKeyHotkey } from 'is-hotkey';
import type { KeyboardEventHandler } from 'react';

const KEYBOARD_CLOSE_SETTLE_MS = 140;
const KEYBOARD_CLOSE_TIMEOUT_MS = 500;
let lastEditableBlurAt = 0;

export interface KeyboardEventLike {
  key: string;
  which: number;
  altKey: boolean;
  ctrlKey: boolean;
  defaultPrevented?: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  preventDefault(): void;
}

export const onTabPress = (evt: KeyboardEventLike, callback: () => void) => {
  if (evt.defaultPrevented) return;
  if (isKeyHotkey('tab', evt)) {
    evt.preventDefault();
    callback();
  }
};

export const preventScrollWithArrowKey: KeyboardEventHandler = (evt) => {
  if (isKeyHotkey(['arrowup', 'arrowright', 'arrowdown', 'arrowleft'], evt)) {
    evt.preventDefault();
  }
};

export const onEnterOrSpace =
  <T>(callback: (evt: T) => void) =>
  (evt: KeyboardEventLike) => {
    if (isKeyHotkey('enter', evt) || isKeyHotkey('space', evt)) {
      evt.preventDefault();
      callback(evt as T);
    }
  };

export const stopPropagation = (evt: KeyboardEvent): boolean => {
  const ae = document.activeElement;
  const editableActiveElement = ae
    ? ae.nodeName.toLowerCase() === 'input' ||
      ae.nodeName.toLowerCase() === 'textarea' ||
      ae.getAttribute('contenteditable') === 'true'
    : false;

  if (editableActiveElement) return false;

  evt.stopPropagation();
  return true;
};

function isEditableElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;

  const tagName = element.tagName.toLowerCase();
  return (
    element.isContentEditable ||
    tagName === 'textarea' ||
    (tagName === 'input' &&
      !['button', 'checkbox', 'file', 'hidden', 'radio', 'range', 'reset', 'submit'].includes(
        (element as HTMLInputElement).type
      ))
  );
}

const nextAnimationFrame = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

export function primeKeyboardCloseForOverlayOpen(): void {
  const activeElement = document.activeElement;
  if (!isEditableElement(activeElement)) return;

  lastEditableBlurAt = Date.now();
  activeElement.blur();
}

export async function closeKeyboardBeforeOpeningOverlay(): Promise<void> {
  const activeElement = document.activeElement;

  if (isEditableElement(activeElement)) {
    lastEditableBlurAt = Date.now();
    activeElement.blur();
  } else if (Date.now() - lastEditableBlurAt > KEYBOARD_CLOSE_TIMEOUT_MS) {
    return;
  }

  const viewport = window.visualViewport;

  await new Promise<void>((resolve) => {
    let complete: (() => void) | undefined = resolve;

    if (!viewport) {
      window.setTimeout(() => {
        const done = complete;
        complete = undefined;
        done?.();
      }, KEYBOARD_CLOSE_SETTLE_MS);
      return;
    }

    let settledTimer: number | null = null;
    let timeoutTimer: number | null = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      lastEditableBlurAt = 0;
      if (settledTimer) clearTimeout(settledTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      viewport.removeEventListener('resize', scheduleSettle);
      viewport.removeEventListener('scroll', scheduleSettle);
      window.removeEventListener('focusout', scheduleSettle);
      const done = complete;
      complete = undefined;
      done?.();
    };

    function scheduleSettle() {
      if (settledTimer) clearTimeout(settledTimer);
      settledTimer = window.setTimeout(finish, KEYBOARD_CLOSE_SETTLE_MS);
    }

    viewport.addEventListener('resize', scheduleSettle);
    viewport.addEventListener('scroll', scheduleSettle);
    window.addEventListener('focusout', scheduleSettle);

    timeoutTimer = window.setTimeout(finish, KEYBOARD_CLOSE_TIMEOUT_MS);
    scheduleSettle();
  });

  await nextAnimationFrame();
}
