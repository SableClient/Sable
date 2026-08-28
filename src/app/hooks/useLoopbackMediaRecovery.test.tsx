import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tauriApi = vi.hoisted(() => ({ isTauri: vi.fn<() => boolean>() }));
const tauriEvent = vi.hoisted(() => ({
  TauriEvent: { WINDOW_RESUMED: 'tauri://resumed' },
  listen: vi.fn<(event: string, handler: () => void) => Promise<() => void>>(),
}));
const commands = vi.hoisted(() => ({ ensureLoopbackMedia: vi.fn<() => Promise<void>>() }));
const mediaUrl = vi.hoisted(() => ({ clearLoopbackMediaUrlCache: vi.fn<() => void>() }));

vi.mock('@tauri-apps/api/core', () => tauriApi);
vi.mock('@tauri-apps/api/event', () => tauriEvent);
vi.mock('$generated/tauri/commands', () => commands);
vi.mock('./useRenderableMediaUrl', () => mediaUrl);

const REBOUND = 'sable-media://loopback-rebound';
const RESUMED = 'tauri://resumed';

const fire = (event: string) => {
  const handler = tauriEvent.listen.mock.calls.find(([name]) => name === event)?.[1] as
    | (() => void)
    | undefined;
  expect(handler).toBeTypeOf('function');
  handler?.();
};

describe('useLoopbackMediaRecovery', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriApi.isTauri.mockReset().mockReturnValue(true);
    tauriEvent.listen.mockReset().mockResolvedValue(() => {});
    commands.ensureLoopbackMedia.mockReset().mockResolvedValue(undefined);
    mediaUrl.clearLoopbackMediaUrlCache.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to nothing outside Tauri', async () => {
    tauriApi.isTauri.mockReturnValue(false);
    const { useLoopbackMediaRecovery } = await import('./useLoopbackMediaRecovery');

    renderHook(() => useLoopbackMediaRecovery());

    expect(tauriEvent.listen).not.toHaveBeenCalled();
  });

  it('drops cached urls when the native side reports the origin moved', async () => {
    const { useLoopbackMediaRecovery } = await import('./useLoopbackMediaRecovery');
    renderHook(() => useLoopbackMediaRecovery());

    fire(REBOUND);

    expect(mediaUrl.clearLoopbackMediaUrlCache).toHaveBeenCalledOnce();
  });

  it('does not drop cached urls on a resume that needed no rebind', async () => {
    const { useLoopbackMediaRecovery } = await import('./useLoopbackMediaRecovery');
    renderHook(() => useLoopbackMediaRecovery());

    fire(RESUMED);

    expect(commands.ensureLoopbackMedia).toHaveBeenCalledOnce();
    expect(mediaUrl.clearLoopbackMediaUrlCache).not.toHaveBeenCalled();
  });

  it('survives a failed repair, because resolving media repairs it anyway', async () => {
    commands.ensureLoopbackMedia.mockRejectedValue(new Error('bind failed'));
    const { useLoopbackMediaRecovery } = await import('./useLoopbackMediaRecovery');
    renderHook(() => useLoopbackMediaRecovery());

    expect(() => fire(RESUMED)).not.toThrow();
    await vi.waitFor(() => expect(commands.ensureLoopbackMedia).toHaveBeenCalledOnce());
  });

  it('unsubscribes both listeners on unmount', async () => {
    const off = vi.fn<() => void>();
    tauriEvent.listen.mockResolvedValue(off);
    const { useLoopbackMediaRecovery } = await import('./useLoopbackMediaRecovery');

    const { unmount } = renderHook(() => useLoopbackMediaRecovery());
    unmount();

    await vi.waitFor(() => expect(off).toHaveBeenCalledTimes(2));
  });
});
