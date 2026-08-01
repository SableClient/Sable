import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IOpenIDToken, MatrixClient } from '$types/matrix-sdk';

const fetchMock = vi.hoisted(() => vi.fn<typeof globalThis.fetch>());

vi.mock('$utils/fetch', () => ({ fetch: fetchMock }));

import {
  getPreferredLivekitTransport,
  provisionLivekitToken,
  useStickyMemberships,
} from './livekitProvisioning';

const openidToken: IOpenIDToken = {
  access_token: 'openid-secret',
  token_type: 'Bearer',
  matrix_server_name: 'example.org',
  expires_in: 3600,
};

const response = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status });

type TestClient = Pick<MatrixClient, 'getOpenIdToken' | '_unstable_getRTCTransports'>;

const client = (overrides: Partial<TestClient> = {}): TestClient => ({
  getOpenIdToken: vi.fn<MatrixClient['getOpenIdToken']>().mockResolvedValue(openidToken),
  _unstable_getRTCTransports: vi
    .fn<MatrixClient['_unstable_getRTCTransports']>()
    .mockResolvedValue([]),
  ...overrides,
});

describe('getPreferredLivekitTransport', () => {
  it('prefers the SDK LiveKit transport over discovery', async () => {
    const mx = client({
      _unstable_getRTCTransports: vi
        .fn<MatrixClient['_unstable_getRTCTransports']>()
        .mockResolvedValue([{ type: 'livekit', livekit_service_url: 'https://sdk.example' }]),
    });

    await expect(
      getPreferredLivekitTransport(mx, {
        'org.matrix.msc4143.rtc_foci': [
          { type: 'livekit', livekit_service_url: 'https://discovery.example' },
        ],
      })
    ).resolves.toEqual({
      type: 'livekit',
      livekit_service_url: 'https://sdk.example',
    });
  });

  it('falls back to discovery when SDK transport discovery fails', async () => {
    const mx = client({
      _unstable_getRTCTransports: vi
        .fn<MatrixClient['_unstable_getRTCTransports']>()
        .mockRejectedValue(new Error('unsupported')),
    });

    await expect(
      getPreferredLivekitTransport(mx, {
        'org.matrix.msc4143.rtc_foci': [
          { type: 'livekit', livekit_service_url: 'https://discovery.example' },
        ],
      })
    ).resolves.toEqual({
      type: 'livekit',
      livekit_service_url: 'https://discovery.example',
    });
  });
});

describe('provisionLivekitToken', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  const options = {
    mx: client(),
    roomId: '!room:example.org',
    slotId: 'm.call#real-slot',
    deviceId: 'DEVICE',
    serviceUrl: 'https://sfu.example///',
    memberId: 'member-id',
    userId: '@alice:example.org',
  };

  it('provisions through the endpoint that matches the advertised membership format', async () => {
    fetchMock.mockResolvedValueOnce(
      response(200, { url: 'wss://livekit.example', jwt: 'jwt-secret' })
    );

    await expect(provisionLivekitToken(options)).resolves.toEqual({
      url: 'wss://livekit.example',
      jwt: 'jwt-secret',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      useStickyMemberships ? 'https://sfu.example/get_token' : 'https://sfu.example/sfu/get'
    );
    expect(JSON.parse(request.body as string)).toEqual(
      useStickyMemberships
        ? {
            room_id: '!room:example.org',
            slot_id: 'm.call#real-slot',
            openid_token: openidToken,
            member: {
              id: 'member-id',
              claimed_user_id: '@alice:example.org',
              claimed_device_id: 'DEVICE',
            },
          }
        : {
            room: '!room:example.org',
            openid_token: openidToken,
            device_id: 'DEVICE',
          }
    );
  });

  it('never tries the other endpoint, whose identity convention would not match', async () => {
    fetchMock.mockResolvedValueOnce(response(404, { error: 'not found' }));

    await expect(provisionLivekitToken(options)).rejects.toThrow(
      'LiveKit token provisioning failed'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid response without retrying', async () => {
    fetchMock.mockResolvedValueOnce(response(200, { url: 'wss://livekit.example' }));

    await expect(provisionLivekitToken(options)).rejects.toThrow(
      'LiveKit token provisioning failed'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry after a server error', async () => {
    fetchMock.mockResolvedValueOnce(response(500, { error: 'boom' }));

    await expect(provisionLivekitToken(options)).rejects.toThrow(
      'LiveKit token provisioning failed'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not expose token values in errors', async () => {
    fetchMock.mockRejectedValue(new Error('request failed: jwt-secret openid-secret'));
    const provisioning = provisionLivekitToken(options);

    await expect(provisioning).rejects.toThrow('LiveKit token provisioning failed');
    await expect(provisioning).rejects.not.toThrow('openid-secret');
    await expect(provisioning).rejects.not.toThrow('jwt-secret');
  });
});
