import to from 'await-to-js';
import type {
  ValidatedAuthMetadata,
  BearerTokenResponse,
  OAuthRegistrationRequest,
} from '$types/matrix-sdk';
import { OAuth2, createClient } from '$types/matrix-sdk';
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { createLogger } from '$utils/debug';
import { fetch } from '$utils/fetch';
import type { Session } from '$state/sessions';
import { TAURI_OIDC_CLIENT_URI, buildTauriOidcRedirectUrl } from '$pages/auth/SSOTauri';

const log = createLogger('oidcLogin');

const CLIENT_NAME = 'Sable';

export enum OidcLoginError {
  RegistrationFailed = 'RegistrationFailed',
  CodeExchangeFailed = 'CodeExchangeFailed',
  MissingDeviceId = 'MissingDeviceId',
  MissingRefreshToken = 'MissingRefreshToken',
  MissingOauthContext = 'MissingOauthContext',
  Unknown = 'Unknown',
}

export class OidcLoginFailure extends Error {
  public constructor(public readonly code: OidcLoginError) {
    super(code);
    this.name = 'OidcLoginFailure';
  }
}

const OAUTH_CONTEXT_KEY_PREFIX = 'oauth_login_context:';

type OauthLoginContext = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  deviceId?: string;
  codeVerifier?: string;
  homeserverUrl: string;
  server?: string;
};

const oauthContextKey = (state: string): string => `${OAUTH_CONTEXT_KEY_PREFIX}${state}`;

export const persistOauthContext = (state: string, ctx: OauthLoginContext): void => {
  // A public OAuth client must retain its one-time PKCE verifier across the full-page redirect.
  // This per-tab context contains no access token, refresh token, or user credentials and is
  // removed before code exchange. Encrypting it with a key available to the same origin would
  // not protect against an attacker capable of reading sessionStorage.
  sessionStorage.setItem(oauthContextKey(state), JSON.stringify(ctx));
};

const consumeOauthContext = (state: string): OauthLoginContext | undefined => {
  const key = oauthContextKey(state);
  const raw = sessionStorage.getItem(key);
  if (!raw) return undefined;
  sessionStorage.removeItem(key);
  try {
    return JSON.parse(raw) as OauthLoginContext;
  } catch {
    return undefined;
  }
};

export const getOauthContextServer = (state: string): string | undefined => {
  try {
    const raw = sessionStorage.getItem(oauthContextKey(state));
    return raw ? (JSON.parse(raw) as OauthLoginContext).server : undefined;
  } catch {
    return undefined;
  }
};

export const hasOauthContext = (state: string): boolean =>
  sessionStorage.getItem(oauthContextKey(state)) !== null;

export const startOidcLogin = async (
  authMetadata: ValidatedAuthMetadata,
  homeserverUrl: string,
  redirectUri: string,
  opts?: { prompt?: string; server?: string }
): Promise<void> => {
  const tauri = isTauri();
  const effectiveRedirectUri = tauri ? buildTauriOidcRedirectUrl() : redirectUri;

  const clientMetadata: OAuthRegistrationRequest = {
    client_name: CLIENT_NAME,
    client_uri: tauri ? TAURI_OIDC_CLIENT_URI : window.location.origin,
    application_type: tauri ? 'native' : 'web',
    redirect_uris: [effectiveRedirectUri],
  };

  const [registerErr, clientId] = await to(OAuth2.registerClient(authMetadata, clientMetadata));
  if (registerErr || !clientId) {
    log.error('OAuth2 client registration failed', registerErr);
    throw new OidcLoginFailure(OidcLoginError.RegistrationFailed);
  }

  const state = crypto.randomUUID();
  const oauth2 = new OAuth2(authMetadata, { clientId, redirectUri: effectiveRedirectUri });

  const authUrl = await oauth2.generateAuthorizationCodeGrantUrl(
    state,
    tauri ? 'query' : 'fragment',
    opts?.prompt
  );

  persistOauthContext(state, {
    issuer: authMetadata.issuer,
    clientId,
    redirectUri: effectiveRedirectUri,
    deviceId: oauth2.context.deviceId,
    codeVerifier: oauth2.context.codeVerifier,
    homeserverUrl,
    server: opts?.server,
  });

  if (tauri) {
    await openUrl(authUrl);
    return;
  }

  window.location.assign(authUrl);
};

const DEVICE_SCOPE_RE = /urn:matrix:(?:org\.matrix\.msc2967\.)?client:device:(\S+)/;

export const deviceIdFromScope = (scope: string): string | undefined =>
  DEVICE_SCOPE_RE.exec(scope)?.[1];

export const expiresInMsFromToken = (token: BearerTokenResponse): number | undefined => {
  if (typeof token.expires_in === 'number') return token.expires_in * 1000;
  return undefined;
};

const requireRefreshToken = (token: BearerTokenResponse): string => {
  if (!token.refresh_token) {
    throw new OidcLoginFailure(OidcLoginError.MissingRefreshToken);
  }
  return token.refresh_token;
};

export type OidcLoginResult = {
  baseUrl: string;
  session: Session;
};

export const completeOidcLogin = async (code: string, state: string): Promise<OidcLoginResult> => {
  const ctx = consumeOauthContext(state);
  if (!ctx) {
    log.error('No OAuth2 context found for state', state);
    throw new OidcLoginFailure(OidcLoginError.MissingOauthContext);
  }

  const mx = createClient({ baseUrl: ctx.homeserverUrl, fetchFn: fetch });
  const [metadataErr, metadata] = await to(mx.getAuthMetadata());
  if (metadataErr || !metadata || metadata.issuer !== ctx.issuer) {
    log.error('OAuth2 auth metadata changed during login', metadataErr);
    throw new OidcLoginFailure(OidcLoginError.CodeExchangeFailed);
  }

  const oauth2 = new OAuth2(metadata, {
    clientId: ctx.clientId,
    redirectUri: ctx.redirectUri,
    deviceId: ctx.deviceId,
    codeVerifier: ctx.codeVerifier,
  });

  const [grantErr, tokenResponse] = await to(oauth2.completeAuthorizationCodeGrant(code));
  if (grantErr || !tokenResponse) {
    log.error('OAuth2 code exchange failed', grantErr);
    throw new OidcLoginFailure(OidcLoginError.CodeExchangeFailed);
  }

  mx.setAccessToken(tokenResponse.access_token);
  const [whoamiErr, whoami] = await to(mx.whoami());
  if (whoamiErr || !whoami?.user_id) {
    log.error('OAuth2 whoami failed', whoamiErr);
    throw new OidcLoginFailure(OidcLoginError.Unknown);
  }

  // Prefer the server-authoritative device id; fall back to the one carried in the granted scope.
  const deviceId = whoami.device_id ?? deviceIdFromScope(tokenResponse.scope ?? '');
  if (!deviceId) {
    throw new OidcLoginFailure(OidcLoginError.MissingDeviceId);
  }

  const session: Session = {
    baseUrl: ctx.homeserverUrl,
    userId: whoami.user_id,
    deviceId,
    accessToken: tokenResponse.access_token,
    refreshToken: requireRefreshToken(tokenResponse),
    expiresInMs: expiresInMsFromToken(tokenResponse),
    oidc: {
      issuer: ctx.issuer,
      clientId: ctx.clientId,
    },
  };

  return { baseUrl: ctx.homeserverUrl, session };
};
