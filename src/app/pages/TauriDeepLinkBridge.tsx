import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { isTauri } from '@tauri-apps/api/core';
import { createLogger } from '$utils/debug';
import {
  parseTauriOidcCallback,
  parseTauriSsoCallback,
  takeTauriSsoNonce,
} from '$pages/auth/SSOTauri';
import { getOauthContextServer, hasOauthContext } from '$pages/auth/login/oidcLoginUtil';
import { getLoginPath, withSearchParam } from './pathUtils';

const log = createLogger('TauriDeepLinkBridge');

export const mapDeepLinkToLoginPath = (rawUrl: string): string | undefined => {
  const ssoCallback = parseTauriSsoCallback(rawUrl);
  if (ssoCallback) {
    const expectedNonce = takeTauriSsoNonce();
    if (!expectedNonce || ssoCallback.nonce !== expectedNonce) {
      log.warn('Rejected SSO deep-link callback: missing or mismatched nonce');
      return undefined;
    }
    return withSearchParam(getLoginPath(ssoCallback.server), {
      loginToken: ssoCallback.loginToken,
    });
  }

  const oidcCallback = parseTauriOidcCallback(rawUrl);
  if (oidcCallback) {
    // Tauri can return the deep link that originally opened the app again after a WebView
    // reload. OAuth callback state is single-use, so ignore callbacks whose pending context
    // has already been consumed instead of navigating to a misleading login error.
    if (!hasOauthContext(oidcCallback.state)) {
      log.warn('Rejected stale OIDC deep-link callback: no pending OAuth context');
      return undefined;
    }
    const loginPath = getLoginPath(getOauthContextServer(oidcCallback.state));
    return 'code' in oidcCallback
      ? withSearchParam(loginPath, {
          code: oidcCallback.code,
          state: oidcCallback.state,
        })
      : withSearchParam(loginPath, {
          error: oidcCallback.error,
          ...(oidcCallback.errorDescription
            ? { error_description: oidcCallback.errorDescription }
            : {}),
          ...(oidcCallback.errorUri ? { error_uri: oidcCallback.errorUri } : {}),
          state: oidcCallback.state,
        });
  }

  return undefined;
};

export function TauriDeepLinkBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauri()) return undefined;

    let mounted = true;
    let unlisten: (() => void) | undefined;

    const applyUrls = (urls: string[]) => {
      const loginPath = urls.map(mapDeepLinkToLoginPath).find((path): path is string => !!path);
      if (loginPath) {
        navigate(loginPath, { replace: true });
      }
    };

    (async () => {
      try {
        const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');

        const current = await getCurrent();
        applyUrls(current ?? []);

        const removeListener = await onOpenUrl((urls) => {
          applyUrls(urls);
        });

        if (mounted) {
          unlisten = removeListener;
        } else {
          removeListener();
        }
      } catch (error) {
        log.warn('Failed to initialize deep link bridge:', error);
      }
    })();

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [navigate]);

  return null;
}
