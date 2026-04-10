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
});
