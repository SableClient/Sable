const TAURI_SSO_PROTOCOL = 'sable:';
const TAURI_SSO_HOST = 'login';

type TauriSsoCallback = {
  loginToken: string;
  server?: string;
};

export const buildTauriSsoRedirectUrl = (server?: string): string => {
  const redirectUrl = new URL(`${TAURI_SSO_PROTOCOL}//${TAURI_SSO_HOST}`);

  if (server) {
    redirectUrl.searchParams.set('server', server);
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
    };
  } catch {
    return undefined;
  }
};
