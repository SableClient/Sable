import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TauriWindowFocus } from './TauriWindowFocus';
import { isWindowFocused, setNativeWindowFocused, subscribeWindowFocus } from '$utils/dom';

const {
  mockIsTauri,
  mockOsType,
  mockIsFocused,
  mockOnFocusChanged,
  mockListen,
  mockGetCurrentWindow,
} = vi.hoisted(() => ({
  mockIsTauri: vi.fn<() => boolean>(),
  mockOsType: vi.fn<() => string>(),
  mockIsFocused: vi.fn<() => Promise<boolean>>(),
  mockOnFocusChanged: vi.fn<(cb: (e: { payload: boolean }) => void) => Promise<() => void>>(),
  mockListen:
    vi.fn<(event: string, cb: (e: { payload: unknown }) => void) => Promise<() => void>>(),
  mockGetCurrentWindow: vi.fn<() => unknown>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: mockIsTauri }));
vi.mock('@tauri-apps/plugin-os', () => ({ type: mockOsType }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: mockGetCurrentWindow }));
vi.mock('$utils/debug', () => ({
  createLogger: () => ({
    log: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
  }),
}));

describe('TauriWindowFocus', () => {
  beforeEach(() => {
    mockIsTauri.mockReturnValue(true);
    mockOsType.mockReturnValue('linux');
    mockIsFocused.mockResolvedValue(true);
    mockOnFocusChanged.mockResolvedValue(() => {});
    mockListen.mockResolvedValue(() => {});
    mockGetCurrentWindow.mockReturnValue({
      isFocused: mockIsFocused,
      onFocusChanged: mockOnFocusChanged,
      listen: mockListen,
    });
  });

  afterEach(() => {
    setNativeWindowFocused(undefined);
    vi.clearAllMocks();
  });

  it('seeds focus from the OS on desktop', async () => {
    mockIsFocused.mockResolvedValue(false);
    render(<TauriWindowFocus />);
    await waitFor(() => expect(isWindowFocused()).toBe(false));
  });

  it('tracks later focus changes and notifies subscribers', async () => {
    render(<TauriWindowFocus />);
    await waitFor(() => expect(mockOnFocusChanged).toHaveBeenCalled());

    const seen: boolean[] = [];
    const unsubscribe = subscribeWindowFocus((focused) => seen.push(focused));

    const emit = mockOnFocusChanged.mock.calls[0]![0];
    emit({ payload: false });
    expect(isWindowFocused()).toBe(false);
    expect(seen).toEqual([false]);

    emit({ payload: true });
    expect(isWindowFocused()).toBe(true);
    expect(seen).toEqual([false, true]);

    unsubscribe();
  });

  it('treats a window hidden to tray as unfocused', async () => {
    render(<TauriWindowFocus />);
    await waitFor(() =>
      expect(mockListen).toHaveBeenCalledWith('window-hidden-to-tray', expect.any(Function))
    );

    const hide = mockListen.mock.calls[0]![1];
    hide({ payload: undefined });

    expect(isWindowFocused()).toBe(false);
  });

  it('does not subscribe on mobile, leaving the DOM path authoritative', async () => {
    mockOsType.mockReturnValue('android');
    render(<TauriWindowFocus />);
    await waitFor(() => expect(mockOnFocusChanged).not.toHaveBeenCalled());
  });

  it('does not subscribe outside Tauri', async () => {
    mockIsTauri.mockReturnValue(false);
    render(<TauriWindowFocus />);
    await waitFor(() => expect(mockGetCurrentWindow).not.toHaveBeenCalled());
  });

  it('ignores a stale initial read that resolves after a focus change', async () => {
    let resolveInitial: ((focused: boolean) => void) | undefined;
    mockIsFocused.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveInitial = resolve;
      })
    );

    render(<TauriWindowFocus />);
    await waitFor(() => expect(mockOnFocusChanged).toHaveBeenCalled());

    mockOnFocusChanged.mock.calls[0]![0]({ payload: false });
    expect(isWindowFocused()).toBe(false);

    resolveInitial?.(true);
    await Promise.resolve();
    expect(isWindowFocused()).toBe(false);
  });

  it('releases the override on unmount so the DOM value applies again', async () => {
    mockIsFocused.mockResolvedValue(false);
    const { unmount } = render(<TauriWindowFocus />);
    await waitFor(() => expect(isWindowFocused()).toBe(false));
    unmount();
    await waitFor(() => expect(isWindowFocused()).toBe(document.hasFocus()));
  });

  it('stops listening on unmount', async () => {
    const stop = vi.fn<() => void>();
    mockOnFocusChanged.mockResolvedValue(stop);
    const { unmount } = render(<TauriWindowFocus />);
    await waitFor(() => expect(mockOnFocusChanged).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });
});
