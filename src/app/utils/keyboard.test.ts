import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeKeyboardBeforeOpeningOverlay,
  onTabPress,
  shouldSuppressMobileEditorRefocus,
} from './keyboard';

type ViewportListener = () => void;

function mockVisualViewport(height = 600) {
  const listeners = {
    resize: new Set<ViewportListener>(),
    scroll: new Set<ViewportListener>(),
  };

  const viewport = {
    height,
    addEventListener: (type: 'resize' | 'scroll', listener: ViewportListener) => {
      listeners[type].add(listener);
    },
    removeEventListener: (type: 'resize' | 'scroll', listener: ViewportListener) => {
      listeners[type].delete(listener);
    },
  };

  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  });

  return {
    emit(type: 'resize' | 'scroll') {
      listeners[type].forEach((listener) => listener());
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: undefined,
  });
});

describe('onTabPress', () => {
  it('does not trigger when the tab event was already handled', () => {
    const callback = vi.fn<() => void>();
    const preventDefault = vi.fn<() => void>();

    onTabPress(
      {
        key: 'Tab',
        which: 9,
        altKey: false,
        ctrlKey: false,
        defaultPrevented: true,
        metaKey: false,
        shiftKey: false,
        preventDefault,
      },
      callback
    );

    expect(callback).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe('closeKeyboardBeforeOpeningOverlay', () => {
  it('waits for viewport changes to settle after blurring the active input', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(0), 0)
    );

    const viewport = mockVisualViewport();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    let resolved = false;
    const waitForClose = closeKeyboardBeforeOpeningOverlay().then(() => {
      resolved = true;
    });

    expect(document.activeElement).not.toBe(input);

    await vi.advanceTimersByTimeAsync(100);
    expect(resolved).toBe(false);

    viewport.emit('resize');

    await vi.advanceTimersByTimeAsync(139);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await vi.runOnlyPendingTimersAsync();
    await waitForClose;
    expect(resolved).toBe(true);
  });

  it('returns immediately when no editable element is focused', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();

    await expect(closeKeyboardBeforeOpeningOverlay()).resolves.toBeUndefined();
    expect(document.activeElement).toBe(button);
  });

  it('clears refocus suppression after the no-visualViewport fallback settles', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(0), 0)
    );

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const waitForClose = closeKeyboardBeforeOpeningOverlay();
    expect(shouldSuppressMobileEditorRefocus()).toBe(true);

    await vi.advanceTimersByTimeAsync(140);
    await vi.runOnlyPendingTimersAsync();
    await waitForClose;

    expect(shouldSuppressMobileEditorRefocus()).toBe(false);
  });
});
