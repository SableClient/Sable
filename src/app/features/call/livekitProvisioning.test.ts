import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IOpenIDToken, MatrixClient } from '$types/matrix-sdk';

const fetchMock = vi.hoisted(() => vi.fn<typeof globalThis.fetch>());

vi.mock('$utils/fetch', () => ({ fetch: fetchMock }));

import { getPreferredLivekitTransport, provisionLivekitToken } from './livekitProvisioning';

const openidToken: IOpenIDToken = {
  access_token: 'openid-secret',
  token_type: 'Bearer',
  matrix_server_name: 'example.org',
  expires_in: 3600,
};

const response = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status });

/** Everything a caller could read off a thrown error, cause chain included. */
const flattenError = (value: unknown, seen = new Set<unknown>()): string => {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return JSON.stringify(value) ?? '';
  if (seen.has(value)) return '';
  seen.add(value);
  const error = value as Error & { cause?: unknown };
  return [
    error.message ?? '',
    JSON.stringify(error, Object.getOwnPropertyNames(error)),
    flattenError(error.cause, seen),
  ].join(' ');
};

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
    expect(url).toBe('https://sfu.example/sfu/get');
    expect(JSON.parse(request.body as string)).toEqual({
      room: '!room:example.org',
      openid_token: openidToken,
      device_id: 'DEVICE',
    });
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

  it('keeps the tokens out of the cause chain too, not just the message', async () => {
    // The request body carries the OpenID token and the response carries the
    // JWT, so the caught error is unsafe to forward by any route. `toThrow`
    // only reads the message, so `new Error(msg, { cause })` slips past it.
    fetchMock.mockRejectedValue(new Error('request failed: jwt-secret openid-secret'));

    const thrown = await provisionLivekitToken(options).then(
      () => undefined,
      (error: unknown) => error
    );

    expect(thrown).toBeInstanceOf(Error);
    expect(flattenError(thrown)).not.toContain('openid-secret');
    expect(flattenError(thrown)).not.toContain('jwt-secret');
  });

  it('keeps the OpenID token out of the error when minting it fails', async () => {
    const mx = client({
      getOpenIdToken: vi
        .fn<MatrixClient['getOpenIdToken']>()
        .mockRejectedValue(new Error('minting failed for openid-secret')),
    });

    const thrown = await provisionLivekitToken({ ...options, mx }).then(
      () => undefined,
      (error: unknown) => error
    );

    expect(thrown).toBeInstanceOf(Error);
    expect(flattenError(thrown)).not.toContain('openid-secret');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('names the endpoint and status so a dead transport is distinguishable', async () => {
    // Which SFU refused and with what status is the difference between a stale
    // transport advertised by another participant and a rejected token.
    fetchMock.mockResolvedValueOnce(response(404, { error: 'nope' }));

    await expect(provisionLivekitToken(options)).rejects.toThrow(
      'LiveKit token provisioning failed against https://sfu.example with status 404'
    );
  });
});
