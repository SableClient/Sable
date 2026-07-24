import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { BearerTokenResponse, ValidatedAuthMetadata } from '$types/matrix-sdk';
import {
  deviceIdFromScope,
  expiresInMsFromToken,
  completeOidcLogin,
  persistOauthContext,
} from './oidcLoginUtil';

describe('deviceIdFromScope', () => {
  it('extracts the device id from the stable device scope', () => {
    const scope = 'openid urn:matrix:client:api:* urn:matrix:client:device:ABC123';
    expect(deviceIdFromScope(scope)).toBe('ABC123');
  });

  it('extracts the device id from the legacy msc2967 device scope', () => {
    const scope =
      'openid urn:matrix:org.matrix.msc2967.client:api:* urn:matrix:org.matrix.msc2967.client:device:XYZ789';
    expect(deviceIdFromScope(scope)).toBe('XYZ789');
  });

  it('returns undefined when no device scope is present', () => {
    expect(deviceIdFromScope('openid urn:matrix:client:api:*')).toBeUndefined();
  });
});

describe('expiresInMsFromToken', () => {
  it('converts expires_in (seconds → ms)', () => {
    const token = {
      access_token: 'x',
      token_type: 'Bearer',
      expires_in: 299,
    } as BearerTokenResponse;
    expect(expiresInMsFromToken(token)).toBe(299_000);
  });

  it('returns undefined when expires_in is absent', () => {
    expect(
      expiresInMsFromToken({ access_token: 'x', token_type: 'Bearer' } as BearerTokenResponse)
    ).toBeUndefined();
  });
});

const mocks = vi.hoisted(() => ({
  oauth2Context: vi.fn<(context: unknown) => void>(),
  completeAuthorizationCodeGrant: vi.fn<(code: string) => Promise<BearerTokenResponse>>(),
  getAuthMetadata: vi.fn<() => Promise<ValidatedAuthMetadata>>(),
  whoami: vi.fn<() => Promise<{ user_id: string; device_id?: string }>>(),
  setAccessToken: vi.fn<(token: string) => void>(),
}));

vi.mock('$types/matrix-sdk', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    OAuth2: class {
      public constructor(_metadata: unknown, context: unknown) {
        mocks.oauth2Context(context);
      }
      public completeAuthorizationCodeGrant = mocks.completeAuthorizationCodeGrant;
      public context = { deviceId: 'dev', codeVerifier: 'verifier' };
    },
    createClient: vi
      .fn<(opts: { baseUrl: string; fetchFn: typeof fetch }) => Record<string, unknown>>()
      .mockImplementation(() => ({
        getAuthMetadata: mocks.getAuthMetadata,
        setAccessToken: mocks.setAccessToken,
        whoami: mocks.whoami,
      })),
  };
});

const metadata = {
  issuer: 'https://issuer.example',
  authorization_endpoint: 'https://issuer.example/authorize',
  token_endpoint: 'https://issuer.example/token',
  revocation_endpoint: 'https://issuer.example/revoke',
  registration_endpoint: 'https://issuer.example/register',
  response_modes_supported: ['query', 'fragment'],
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
} as ValidatedAuthMetadata;

const tokenResponse = {
  access_token: 'access-tok',
  token_type: 'Bearer',
  refresh_token: 'refresh-tok',
  expires_in: 300,
} as BearerTokenResponse;

describe('completeOidcLogin', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.oauth2Context.mockReset();
    mocks.completeAuthorizationCodeGrant.mockReset().mockResolvedValue(tokenResponse);
    mocks.getAuthMetadata.mockReset().mockResolvedValue(metadata);
    mocks.whoami
      .mockReset()
      .mockResolvedValue({ user_id: '@alice:hs.example', device_id: 'DEV123' });
    mocks.setAccessToken.mockReset();
  });

  it('uses the registered redirect URI from the OAuth context, not a re-parsed callback URL', async () => {
    persistOauthContext('s1', {
      issuer: 'https://issuer.example',
      clientId: 'client',
      redirectUri: 'moe.sable.app:/login',
      deviceId: 'dev',
      codeVerifier: 'verifier',
      homeserverUrl: 'https://hs.example',
    });

    await completeOidcLogin('code-1', 's1');

    expect(mocks.oauth2Context).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUri: 'moe.sable.app:/login' })
    );
  });
});
