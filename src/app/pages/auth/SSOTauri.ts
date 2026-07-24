import { SSO_CALLBACK_PATH } from '$pages/paths';
import { type as osType } from '@tauri-apps/plugin-os';

const TAURI_SSO_PROTOCOL = 'sable:';
const TAURI_SSO_HOST = 'login';

const getAppBaseUrl = (): string => {
  const os = osType();
  if (os === 'ios' || os === 'android') {
    return `${TAURI_SSO_PROTOCOL}//${TAURI_SSO_HOST}`;
  }

  if (import.meta.env.DEV) {
    // TODO: disabled for now since it causes issues with the SSO flow. We should find a better solution for this in the future.
    // return window.location.origin;
    return `${TAURI_SSO_PROTOCOL}//${TAURI_SSO_HOST}`;
  }

  return `${TAURI_SSO_PROTOCOL}//${TAURI_SSO_HOST}`;
};

type TauriSsoCallback = {
  loginToken: string;
  server?: string;
  nonce?: string;
};

const TAURI_SSO_NONCE_KEY = 'sable:tauri-sso:nonce';

export const rememberTauriSsoNonce = (nonce: string): void => {
  try {
    localStorage.setItem(TAURI_SSO_NONCE_KEY, nonce);
  } catch {
    // ignore storage failures
  }
};

export const takeTauriSsoNonce = (): string | undefined => {
  try {
    const nonce = localStorage.getItem(TAURI_SSO_NONCE_KEY) ?? undefined;
    localStorage.removeItem(TAURI_SSO_NONCE_KEY);
    return nonce;
  } catch {
    return undefined;
  }
};

export const buildTauriSsoRedirectUrl = (server?: string): string => {
  const redirectUrl = new URL(SSO_CALLBACK_PATH, getAppBaseUrl());

  if (server) {
    redirectUrl.searchParams.set('server', server);
  }

  const nonce = crypto.randomUUID();
  rememberTauriSsoNonce(nonce);
  redirectUrl.searchParams.set('sso_nonce', nonce);

  return redirectUrl.toString();
};

export const TAURI_OIDC_CLIENT_URI = 'https://app.sable.moe';

const TAURI_OIDC_PROTOCOL = 'moe.sable.app:';
const TAURI_OIDC_PATH = '/login';

export const buildTauriOidcRedirectUrl = (): string => `${TAURI_OIDC_PROTOCOL}${TAURI_OIDC_PATH}`;

export const parseTauriOidcCallback = (
  rawUrl: string
):
  | { code: string; state: string }
  | { error: string; errorDescription?: string; errorUri?: string; state: string }
  | undefined => {
  try {
    const callbackUrl = new URL(rawUrl);
    if (callbackUrl.protocol !== TAURI_OIDC_PROTOCOL) return undefined;

    // `moe.sable.app:/login?...`  → hostname === '', pathname === '/login'
    // `moe.sable.app://login?...` → hostname === 'login', pathname === '/' or ''
    const hasLoginPath =
      callbackUrl.pathname === TAURI_OIDC_PATH || callbackUrl.pathname === `${TAURI_OIDC_PATH}/`;

    const isSingleSlashFormat = callbackUrl.hostname === '' && hasLoginPath;

    const isAuthorityFormat =
      callbackUrl.hostname === 'login' &&
      (callbackUrl.pathname === '/' || callbackUrl.pathname === '');

    if (!isSingleSlashFormat && !isAuthorityFormat) return undefined;

    const code = callbackUrl.searchParams.get('code');
    const state = callbackUrl.searchParams.get('state');
    if (!state) return undefined;

    if (code) return { code, state };

    const error = callbackUrl.searchParams.get('error');
    if (!error) return undefined;

    return {
      error,
      errorDescription: callbackUrl.searchParams.get('error_description') ?? undefined,
      errorUri: callbackUrl.searchParams.get('error_uri') ?? undefined,
      state,
    };
  } catch {
    return undefined;
  }
};

export const parseTauriSsoCallback = (rawUrl: string): TauriSsoCallback | undefined => {
  try {
    const callbackUrl = new URL(rawUrl);
    if (callbackUrl.protocol !== TAURI_SSO_PROTOCOL) return undefined;
    if (callbackUrl.hostname !== TAURI_SSO_HOST) return undefined;

    const loginToken = callbackUrl.searchParams.get('loginToken');
    if (!loginToken) return undefined;

    return {
      loginToken,
      server: callbackUrl.searchParams.get('server') ?? undefined,
      nonce: callbackUrl.searchParams.get('sso_nonce') ?? undefined,
    };
  } catch {
    return undefined;
  }
};
