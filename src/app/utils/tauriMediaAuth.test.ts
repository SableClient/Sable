import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriApi = vi.hoisted(() => ({
  isTauri: vi.fn<() => boolean>(),
}));
const commands = vi.hoisted(() => ({
  clearMediaSession: vi.fn<() => Promise<void>>(),
  setMediaSession:
    vi.fn<
      ({
        baseUrl,
        token,
        scope,
      }: {
        baseUrl: string;
        token: string;
        scope?: string;
      }) => Promise<void>
    >(),
}));
const mediaTransport = vi.hoisted(() => ({
  getActiveMediaSession:
    vi.fn<() => { baseUrl: string; accessToken: string; userId: string } | undefined>(),
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

    const first = updateTauriMediaSession('https://one.example', 'one', '@a:one.example');
    const second = updateTauriMediaSession('https://two.example', 'two', '@b:two.example');
    const clear = updateTauriMediaSession();

    await Promise.resolve();
    expect(commands.setMediaSession).toHaveBeenCalledTimes(1);
    resolveFirst?.();
    await Promise.all([first, second, clear]);

    expect(commands.setMediaSession).toHaveBeenNthCalledWith(1, {
      baseUrl: 'https://one.example',
      token: 'one',
      scope: '@a:one.example',
    });
    expect(commands.setMediaSession).toHaveBeenNthCalledWith(2, {
      baseUrl: 'https://two.example',
      token: 'two',
      scope: '@b:two.example',
    });
    expect(commands.clearMediaSession).toHaveBeenCalledTimes(1);
  });

  it('waits for the initial active session write', async () => {
    let resolveWrite: (() => void) | undefined;
    mediaTransport.getActiveMediaSession.mockReturnValue({
      baseUrl: 'https://matrix.example',
      accessToken: 'token',
      userId: '@a:matrix.example',
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

  it('keys the native media cache on the user ID, not the rotating access token', async () => {
    mediaTransport.getActiveMediaSession.mockReturnValue({
      baseUrl: 'https://matrix.example',
      accessToken: 'access-token-v1',
      userId: '@a:matrix.example',
    });

    await initTauriMediaSession();
    await updateTauriMediaSession('https://matrix.example', 'access-token-v2', '@a:matrix.example');

    // A token refresh must not change `scope`, otherwise every cached avatar and image is
    // orphaned and re-downloaded.
    const scopes = commands.setMediaSession.mock.calls.map(([params]) => params.scope);
    expect(scopes).toEqual(['@a:matrix.example', '@a:matrix.example']);
  });

  it('syncs the native session when the active account changes in this window', async () => {
    mediaTransport.getActiveMediaSession
      .mockReturnValueOnce({
        baseUrl: 'https://one.example',
        accessToken: 'one',
        userId: '@a:one.example',
      })
      .mockReturnValue({
        baseUrl: 'https://two.example',
        accessToken: 'two',
        userId: '@b:two.example',
      });

    await initTauriMediaSession();
    commands.setMediaSession.mockClear();

    window.dispatchEvent(new Event('sable-session-changed'));
    await vi.waitFor(() => expect(commands.setMediaSession).toHaveBeenCalledTimes(1));

    expect(commands.setMediaSession).toHaveBeenCalledWith({
      baseUrl: 'https://two.example',
      token: 'two',
      scope: '@b:two.example',
    });
  });

  it('does not wipe the native session when a sync reads no stored session', async () => {
    mediaTransport.getActiveMediaSession.mockReturnValue(undefined);

    await initTauriMediaSession();

    window.dispatchEvent(new Event('sable-session-changed'));
    window.dispatchEvent(new StorageEvent('storage', { key: 'matrixSessions' }));
    await Promise.resolve();

    expect(commands.clearMediaSession).not.toHaveBeenCalled();
    expect(commands.setMediaSession).not.toHaveBeenCalled();

    await updateTauriMediaSession();
    expect(commands.clearMediaSession).toHaveBeenCalledTimes(1);
  });
});
