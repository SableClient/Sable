import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '$state/sessions';

const mediaTransport = vi.hoisted(() => ({
  fetchMediaBlob: vi.fn(),
}));

vi.mock('$utils/mediaTransport', () => mediaTransport);

describe('useSessionProfiles', () => {
  beforeEach(() => {
    vi.resetModules();
    mediaTransport.fetchMediaBlob.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/_matrix/client/v3/profile/%40alice%3Aexample.org')) {
          return new Response(
            JSON.stringify({
              displayname: 'Alice',
              avatar_url: 'mxc://example.org/avatar',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        return new Response('', { status: 404 });
      })
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:session-avatar');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches session avatar thumbnails through the media transport with session-scoped auth', async () => {
    const avatarBlob = new Blob(['avatar'], { type: 'image/png' });
    mediaTransport.fetchMediaBlob.mockResolvedValue(avatarBlob);

    const sessions: Session[] = [
      {
        baseUrl: 'https://matrix.example.org',
        userId: '@alice:example.org',
        deviceId: 'DEVICE',
        accessToken: 'alice-token',
      },
    ];

    const { useSessionProfiles } = await import('./useSessionProfiles');
    const { result } = renderHook(() => useSessionProfiles(sessions));

    await waitFor(() => {
      expect(result.current['@alice:example.org']).toEqual({
        displayName: 'Alice',
        avatarHttpUrl: 'blob:session-avatar',
      });
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mediaTransport.fetchMediaBlob).toHaveBeenCalledWith(
      'https://matrix.example.org/_matrix/client/v1/media/thumbnail/example.org/avatar?width=96&height=96&method=crop',
      {
        accessToken: 'alice-token',
        sessionScope: '@alice:example.org',
      }
    );
    expect(URL.createObjectURL).toHaveBeenCalledWith(avatarBlob);
  });

  it('refetches profiles when the same user session is reauthenticated', async () => {
    mediaTransport.fetchMediaBlob
      .mockResolvedValueOnce(new Blob(['avatar-1'], { type: 'image/png' }))
      .mockResolvedValueOnce(new Blob(['avatar-2'], { type: 'image/png' }));
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce('blob:session-avatar-1')
      .mockReturnValueOnce('blob:session-avatar-2');

    const { useSessionProfiles } = await import('./useSessionProfiles');
    const { result, rerender } = renderHook(
      ({ sessions }: { sessions: Session[] }) => useSessionProfiles(sessions),
      {
        initialProps: {
          sessions: [
            {
              baseUrl: 'https://matrix.example.org',
              userId: '@alice:example.org',
              deviceId: 'DEVICE',
              accessToken: 'alice-token-1',
            },
          ],
        },
      }
    );

    await waitFor(() => {
      expect(result.current['@alice:example.org']).toEqual({
        displayName: 'Alice',
        avatarHttpUrl: 'blob:session-avatar-1',
      });
    });

    rerender({
      sessions: [
        {
          baseUrl: 'https://matrix.example.org',
          userId: '@alice:example.org',
          deviceId: 'DEVICE',
          accessToken: 'alice-token-2',
        },
      ],
    });

    await waitFor(() => {
      expect(result.current['@alice:example.org']).toEqual({
        displayName: 'Alice',
        avatarHttpUrl: 'blob:session-avatar-2',
      });
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mediaTransport.fetchMediaBlob).toHaveBeenNthCalledWith(
      1,
      'https://matrix.example.org/_matrix/client/v1/media/thumbnail/example.org/avatar?width=96&height=96&method=crop',
      {
        accessToken: 'alice-token-1',
        sessionScope: '@alice:example.org',
      }
    );
    expect(mediaTransport.fetchMediaBlob).toHaveBeenNthCalledWith(
      2,
      'https://matrix.example.org/_matrix/client/v1/media/thumbnail/example.org/avatar?width=96&height=96&method=crop',
      {
        accessToken: 'alice-token-2',
        sessionScope: '@alice:example.org',
      }
    );
  });

  it('revokes avatar blob urls on unmount', async () => {
    mediaTransport.fetchMediaBlob.mockResolvedValue(new Blob(['avatar'], { type: 'image/png' }));

    const sessions: Session[] = [
      {
        baseUrl: 'https://matrix.example.org',
        userId: '@alice:example.org',
        deviceId: 'DEVICE',
        accessToken: 'alice-token',
      },
    ];

    const { useSessionProfiles } = await import('./useSessionProfiles');
    const { result, unmount } = renderHook(() => useSessionProfiles(sessions));

    await waitFor(() => {
      expect(result.current['@alice:example.org']).toEqual({
        displayName: 'Alice',
        avatarHttpUrl: 'blob:session-avatar',
      });
    });

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:session-avatar');
  });
});
