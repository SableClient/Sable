import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeKind, useSystemThemeKind } from './useTheme';

type MediaQueryChangeHandler = () => void;
type MediaQueryListener = (event: string, handler: MediaQueryChangeHandler) => void;

let darkModeMatches = false;
let mediaQueryChangeHandler: MediaQueryChangeHandler | undefined;

const setVisibilityState = (visibilityState: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  });
};

beforeEach(() => {
  darkModeMatches = false;
  mediaQueryChangeHandler = undefined;
  setVisibilityState('visible');

  window.matchMedia = vi.fn<(query: string) => MediaQueryList>((query) => {
    const mediaQueryList = {
      media: query,
      onchange: null,
      get matches() {
        return darkModeMatches;
      },
      addEventListener: vi.fn<MediaQueryListener>((event, handler) => {
        if (event === 'change') mediaQueryChangeHandler = handler;
      }),
      removeEventListener: vi.fn<MediaQueryListener>((event, handler) => {
        if (event === 'change' && mediaQueryChangeHandler === handler) {
          mediaQueryChangeHandler = undefined;
        }
      }),
      addListener: vi.fn<(handler: MediaQueryChangeHandler) => void>(),
      removeListener: vi.fn<(handler: MediaQueryChangeHandler) => void>(),
      dispatchEvent: vi.fn<(event: Event) => boolean>(),
    } as unknown as MediaQueryList;

    return mediaQueryList;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  setVisibilityState('visible');
});

describe('useSystemThemeKind', () => {
  it('updates when the media query emits a change event', () => {
    const { result } = renderHook(() => useSystemThemeKind());

    expect(result.current).toBe(ThemeKind.Light);

    act(() => {
      darkModeMatches = true;
      mediaQueryChangeHandler?.();
    });

    expect(result.current).toBe(ThemeKind.Dark);
  });

  it('rechecks the system theme when a hidden PWA becomes visible', () => {
    const { result } = renderHook(() => useSystemThemeKind());

    expect(result.current).toBe(ThemeKind.Light);

    act(() => {
      setVisibilityState('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      darkModeMatches = true;
      setVisibilityState('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current).toBe(ThemeKind.Dark);
  });

  it('rechecks the system theme on pageshow restore', () => {
    const { result } = renderHook(() => useSystemThemeKind());

    expect(result.current).toBe(ThemeKind.Light);

    act(() => {
      darkModeMatches = true;
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });

    expect(result.current).toBe(ThemeKind.Dark);
  });
});
