import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriApi = vi.hoisted(() => ({
  isTauri: vi.fn<() => boolean>(),
}));
const commands = vi.hoisted(() => ({
  clearMediaSession: vi.fn<() => Promise<void>>(),
  setMediaSession:
    vi.fn<({ baseUrl, token }: { baseUrl: string; token: string }) => Promise<void>>(),
}));
const mediaTransport = vi.hoisted(() => ({
  getActiveMediaSession: vi.fn<() => { baseUrl: string; accessToken: string } | undefined>(),
}));

vi.mock('@tauri-apps/api/core', () => tauriApi);
vi.mock('$generated/tauri/commands', () => commands);
vi.mock('./mediaTransport', () => mediaTransport);

const { initTauriMediaSession, updateTauriMediaSession } = await import('./tauriMediaAuth');

describe('Tauri media session coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriApi.isTauri.mockReturnValue(true);
    commands.clearMediaSession.mockResolvedValue();
    commands.setMediaSession.mockResolvedValue();
  });

  it('serializes writes and applies the last requested state', async () => {
    let resolveFirst: (() => void) | undefined;
    commands.setMediaSession
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce();

    const first = updateTauriMediaSession('https://one.example', 'one');
    const second = updateTauriMediaSession('https://two.example', 'two');
    const clear = updateTauriMediaSession();

    await Promise.resolve();
    expect(commands.setMediaSession).toHaveBeenCalledTimes(1);
    resolveFirst?.();
    await Promise.all([first, second, clear]);

    expect(commands.setMediaSession).toHaveBeenNthCalledWith(1, {
      baseUrl: 'https://one.example',
      token: 'one',
    });
    expect(commands.setMediaSession).toHaveBeenNthCalledWith(2, {
      baseUrl: 'https://two.example',
      token: 'two',
    });
    expect(commands.clearMediaSession).toHaveBeenCalledTimes(1);
  });

  it('waits for the initial active session write', async () => {
    let resolveWrite: (() => void) | undefined;
    mediaTransport.getActiveMediaSession.mockReturnValue({
      baseUrl: 'https://matrix.example',
      accessToken: 'token',
    });
    commands.setMediaSession.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        })
    );

    const ready = initTauriMediaSession();
    let complete = false;
    void ready.then(() => {
      complete = true;
    });
    await Promise.resolve();
    expect(complete).toBe(false);

    resolveWrite?.();
    await ready;
    expect(complete).toBe(true);
  });
});
