import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isTauri } from '@tauri-apps/api/core';
import { createLogger } from '$utils/debug';
import { parseTauriSsoCallback } from '$pages/auth/SSOTauri';
import { getLoginPath, withSearchParam } from './pathUtils';

const log = createLogger('TauriDeepLinkBridge');

const mapDeepLinkToLoginPath = (rawUrl: string): string | undefined => {
  const callback = parseTauriSsoCallback(rawUrl);
  if (!callback) return undefined;

  return withSearchParam(getLoginPath(callback.server), { loginToken: callback.loginToken });
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
