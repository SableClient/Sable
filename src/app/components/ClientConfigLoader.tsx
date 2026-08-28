import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, Text, color, config } from 'folds';
import type { ClientConfig } from '$hooks/useClientConfig';
import { takePreloadedConfig } from '$utils/preload';
import { trimTrailingSlash } from '$utils/common';
import { fetch } from '$utils/fetch';
import { SplashScreen } from '$components/splash-screen';

export const FALLBACK_CLIENT_CONFIG: ClientConfig = {
  defaultHomeserver: 0,
  homeserverList: ['matrix.org'],
  allowCustomHomeservers: false,
  hashRouter: { enabled: false, basename: '/' },
};

const getClientConfig = async (): Promise<ClientConfig> => {
  const preloaded = takePreloadedConfig();
  if (preloaded !== undefined) {
    const data = await preloaded.catch(() => undefined);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as ClientConfig;
    }
    // Preload missed or invalid — fall through to fresh fetch.
  }

  const url = `${trimTrailingSlash(import.meta.env.BASE_URL)}/config.json`;
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to load config.json (${response.status} ${response.statusText})`);
  }

  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('config.json must contain a JSON object.');
  }
  return data as ClientConfig;
};

type ClientConfigLoaderProps = {
  fallback?: () => ReactNode;
  error?: (error: unknown, retry: () => void, ignore: () => void) => ReactNode;
  children: (config: ClientConfig) => ReactNode;
};

type ConfigLoadState =
  | { status: 'loading' }
  | { status: 'ready'; config: ClientConfig }
  | { status: 'error'; error: unknown };

const renderConfigError = (error: unknown, retry: () => void, ignore: () => void) => (
  <SplashScreen>
    <Box grow="Yes" direction="Column" gap="400" alignItems="Center" justifyContent="Center">
      <Dialog>
        <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
          <Box direction="Column" gap="100">
            <Text>Failed to load client configuration.</Text>
            {error instanceof Error && (
              <Text size="T300" style={{ color: color.Critical.Main }}>
                {error.message}
              </Text>
            )}
          </Box>
          <Button variant="Critical" onClick={retry}>
            <Text as="span" size="B400">
              Retry
            </Text>
          </Button>
          <Button variant="Critical" onClick={ignore} fill="Soft">
            <Text as="span" size="B400">
              Continue with defaults
            </Text>
          </Button>
        </Box>
      </Dialog>
    </Box>
  </SplashScreen>
);

export function ClientConfigLoader({ fallback, error, children }: ClientConfigLoaderProps) {
  const [state, setState] = useState<ConfigLoadState>({ status: 'loading' });
  const [useFallback, setUseFallback] = useState(false);
  const requestIdRef = useRef(0);

  const load = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setUseFallback(false);
    setState({ status: 'loading' });

    void getClientConfig().then(
      (loadedConfig) => {
        if (requestId === requestIdRef.current) {
          setState({ status: 'ready', config: loadedConfig });
        }
      },
      (loadError: unknown) => {
        if (requestId === requestIdRef.current) setState({ status: 'error', error: loadError });
      }
    );
  }, []);

  const ignoreError = useCallback(() => setUseFallback(true), []);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  if (state.status === 'loading') {
    return fallback?.();
  }
  if (state.status === 'error' && !useFallback) {
    return (error ?? renderConfigError)(state.error, load, ignoreError);
  }

  const clientConfig = state.status === 'ready' ? state.config : FALLBACK_CLIENT_CONFIG;
  return children(clientConfig);
}
