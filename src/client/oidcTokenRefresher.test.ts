import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient, ValidatedAuthMetadata } from '$types/matrix-sdk';
import { MATRIX_SESSIONS_KEY } from '$state/sessions';
import type { Session } from '$state/sessions';
import { createSessionTokenRefresher } from './oidcTokenRefresher';

const mocks = vi.hoisted(() => ({
  refresh:
    vi.fn<(refreshToken: string) => Promise<{ accessToken: string; refreshToken?: string }>>(),
  pushSessionToSW: vi.fn<() => Promise<void>>(),
}));

vi.mock('$types/matrix-sdk', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    OAuth2: class {
      public readonly mock = true;
    },
    TokenRefresher: class {
      public tokenRefreshFunction = async (refreshToken: string) => {
        const tokens = await mocks.refresh(refreshToken);
        await this.onRefresh(tokens);
        return tokens;
      };

      public constructor(
        _oauth2: unknown,
        private readonly onRefresh: (tokens: unknown) => Promise<void>
      ) {}
    },
  };
});

vi.mock('../sw-session', () => ({ pushSessionToSW: mocks.pushSessionToSW }));

const session: Session = {
  baseUrl: 'https://hs.example',
  userId: '@alice:hs.example',
  deviceId: 'device',
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  oidc: { issuer: 'https://issuer.example', clientId: 'client' },
};

const metadata = {
  issuer: 'https://issuer.example',
  authorization_endpoint: 'https://issuer.example/authorize',
  token_endpoint: 'https://issuer.example/token',
  revocation_endpoint: 'https://issuer.example/revoke',
  registration_endpoint: 'https://issuer.example/register',
  response_modes_supported: ['query'],
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
} as ValidatedAuthMetadata;

const getAuthMetadata = vi.fn<() => Promise<ValidatedAuthMetadata>>();
const mx = { getAuthMetadata } as unknown as MatrixClient;

describe('createSessionTokenRefresher', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.refresh.mockReset();
    mocks.pushSessionToSW.mockReset().mockResolvedValue(undefined);
    getAuthMetadata.mockReset().mockResolvedValue(metadata);
    localStorage.setItem(MATRIX_SESSIONS_KEY, JSON.stringify([session]));
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: undefined,
    });
  });

  it('serializes concurrent same-user refreshers and reuses rotated tokens', async () => {
    let resolveRefresh!: (tokens: { accessToken: string; refreshToken: string }) => void;
    mocks.refresh.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );

    const first = createSessionTokenRefresher(session, mx)!;
    const second = createSessionTokenRefresher(session, mx)!;
    const firstRefresh = first.tokenRefreshFunction('old-refresh');
    const secondRefresh = second.tokenRefreshFunction('old-refresh');

    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    resolveRefresh({ accessToken: 'new-access', refreshToken: 'new-refresh' });

    await expect(firstRefresh).resolves.toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    await expect(secondRefresh).resolves.toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(MATRIX_SESSIONS_KEY)!)[0]).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
  });

  it('uses the current stored token after waiting for the cross-tab refresh lock', async () => {
    const request = vi.fn<(name: string, callback: () => Promise<unknown>) => Promise<unknown>>(
      async (_name, callback) => {
        localStorage.setItem(
          MATRIX_SESSIONS_KEY,
          JSON.stringify([
            { ...session, accessToken: 'other-access', refreshToken: 'other-refresh' },
          ])
        );
        return callback();
      }
    );
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request },
    });

    const refresher = createSessionTokenRefresher(session, mx)!;

    await expect(refresher.tokenRefreshFunction('old-refresh')).resolves.toEqual({
      accessToken: 'other-access',
      refreshToken: 'other-refresh',
    });
    expect(request).toHaveBeenCalledWith('sable-oidc-refresh', expect.any(Function));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
