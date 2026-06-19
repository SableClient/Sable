import { SSO_CALLBACK_PATH } from '$pages/paths';
import { APP_SUPPORT_URL } from '$app/config/brand';
import { type as osType } from '@tauri-apps/plugin-os';

export const TAURI_SSO_PROTOCOL = 'charm:';
export const TAURI_SSO_HOST = 'login';
export const TAURI_SSO_CALLBACK_BASE = `${TAURI_SSO_PROTOCOL}//${TAURI_SSO_HOST}`;

const getAppBaseUrl = (): string => {
  const os = osType();
  if (os === 'ios' || os === 'android') {
    return TAURI_SSO_CALLBACK_BASE;
  }

  if (import.meta.env.DEV) {
    // TODO: disabled for now since it causes issues with the SSO flow. We should find a better solution for this in the future.
    // return window.location.origin;
    return TAURI_SSO_CALLBACK_BASE;
  }

  return APP_SUPPORT_URL;
};

type TauriSsoCallback = {
  loginToken: string;
  server?: string;
  addAccount?: boolean;
};

export const buildTauriSsoRedirectUrl = (
  server?: string,
  options?: { addAccount?: boolean }
): string => {
  const redirectUrl = new URL(SSO_CALLBACK_PATH, getAppBaseUrl());

  if (server) {
    redirectUrl.searchParams.set('server', server);
  }
  if (options?.addAccount) {
    redirectUrl.searchParams.set('addAccount', '1');
  }

  return redirectUrl.toString();
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
      addAccount: callbackUrl.searchParams.get('addAccount') === '1',
    };
  } catch {
    return undefined;
  }
};
