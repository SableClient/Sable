import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const {
  pause,
  resume,
  getSlidingSyncManager,
  listen,
  listenOff,
  mockIsTauri,
  mockIsMobileTauri,
  mockCallEmbed,
} = vi.hoisted(() => ({
  pause: vi.fn<() => void>(),
  resume: vi.fn<() => void>(),
  getSlidingSyncManager: vi.fn<() => unknown>(),
  listen: vi.fn<(_event: string, _cb: () => void) => Promise<() => void>>(),
  listenOff: vi.fn<() => void>(),
  mockIsTauri: { value: false },
  mockIsMobileTauri: { value: true },
  mockCallEmbed: { value: undefined as unknown },
}));

vi.mock('$client/initMatrix', () => ({ getSlidingSyncManager }));

vi.mock('jotai', () => ({
  useAtomValue: () => mockCallEmbed.value,
  atom: vi.fn<() => unknown>(),
}));

vi.mock('../state/callEmbed', () => ({ callEmbedAtom: {} }));

vi.mock('@tauri-apps/api/event', () => ({
  listen,
  TauriEvent: { WINDOW_RESUMED: 'tauri://resumed' },
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => mockIsTauri.value }));

vi.mock('$utils/platform', () => ({ isMobileTauri: () => mockIsMobileTauri.value }));

import { useBackgroundSyncPause } from './useBackgroundSyncPause';

const setVisibility = (state: 'visible' | 'hidden') =>
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);

describe('useBackgroundSyncPause', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pause.mockReset();
    resume.mockReset();
    listenOff.mockReset();
    listen.mockReset().mockResolvedValue(listenOff);
    getSlidingSyncManager.mockReset().mockReturnValue({ pause, resume });
    mockIsTauri.value = false;
    mockIsMobileTauri.value = true;
    mockCallEmbed.value = undefined;
  });

  it('pauses sync when the app is backgrounded', () => {
    setVisibility('visible');
    renderHook(() => useBackgroundSyncPause({ clientRunning: true } as never));

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(pause).toHaveBeenCalled();
  });

  it('resumes sync when the app returns to the foreground', () => {
    setVisibility('hidden');
    renderHook(() => useBackgroundSyncPause({ clientRunning: true } as never));
    pause.mockClear();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(resume).toHaveBeenCalled();
  });

  it('keeps polling in the background during a call', () => {
    mockCallEmbed.value = { dispose: vi.fn<() => void>() };
    setVisibility('hidden');

    renderHook(() => useBackgroundSyncPause({ clientRunning: true } as never));

    expect(pause).not.toHaveBeenCalled();
    expect(resume).toHaveBeenCalled();
  });

  it('resumes on tauri://resumed without waiting for visibilitychange', () => {
    mockIsTauri.value = true;
    setVisibility('hidden');
    renderHook(() => useBackgroundSyncPause({ clientRunning: true } as never));
    resume.mockClear();

    const [, cb] = listen.mock.calls[0] as [string, () => void];
    cb();

    expect(resume).toHaveBeenCalled();
  });

  it('resumes on window focus when visibilitychange was missed', () => {
    setVisibility('hidden');
    renderHook(() => useBackgroundSyncPause({ clientRunning: true } as never));
    resume.mockClear();

    setVisibility('visible');
    window.dispatchEvent(new Event('focus'));

    expect(resume).toHaveBeenCalled();
  });

  it('does not resume on a focus event while still hidden', () => {
    setVisibility('hidden');
    renderHook(() => useBackgroundSyncPause({ clientRunning: true } as never));
    resume.mockClear();

    window.dispatchEvent(new Event('focus'));

    expect(resume).not.toHaveBeenCalled();
  });

  it('keeps polling when a browser tab is hidden', () => {
    mockIsMobileTauri.value = false;
    setVisibility('visible');
    renderHook(() => useBackgroundSyncPause({ clientRunning: true } as never));

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(pause).not.toHaveBeenCalled();
  });

  it('does nothing without a client', () => {
    renderHook(() => useBackgroundSyncPause(undefined));

    expect(pause).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it('resumes on unmount so a paused transport is never left parked', () => {
    setVisibility('hidden');
    const { unmount } = renderHook(() => useBackgroundSyncPause({ clientRunning: true } as never));
    resume.mockClear();

    unmount();

    expect(resume).toHaveBeenCalled();
  });
});
