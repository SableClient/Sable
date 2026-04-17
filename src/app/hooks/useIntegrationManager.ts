import { useCallback, useEffect, useState } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import { useMatrixClient } from './useMatrixClient';

export interface IntegrationManager {
  apiUrl: string;
  uiUrl: string;
}

const DEFAULT_MANAGERS: IntegrationManager[] = [
  {
    apiUrl: 'https://scalar.vector.im/api',
    uiUrl: 'https://scalar.vector.im',
  },
];

async function discoverManagers(mx: MatrixClient): Promise<IntegrationManager[]> {
  const managers: IntegrationManager[] = [];

  try {
    const baseUrl = mx.getHomeserverUrl();
    const url = new URL(baseUrl);
    const wellKnownUrl = `https://${url.hostname}/.well-known/matrix/client`;

    const resp = await fetch(wellKnownUrl, { method: 'GET' });
    if (resp.ok) {
      const data = await resp.json();
      const integrations = data?.['m.integrations'];
      if (integrations?.managers && Array.isArray(integrations.managers)) {
        integrations.managers.forEach((mgr: { api_url?: string; ui_url?: string }) => {
          if (mgr.api_url && mgr.ui_url) {
            managers.push({ apiUrl: mgr.api_url, uiUrl: mgr.ui_url });
          }
        });
      }
    }
  } catch {
    // ignore malformed or unavailable .well-known data
  }

  try {
    const widgetsEvent = mx.getAccountData('m.widgets' as never);
    if (widgetsEvent) {
      const content = widgetsEvent.getContent();
      Object.values(content).forEach(
        (widget: { type?: string; url?: string; data?: { api_url?: string } }) => {
          if (widget?.type === 'm.integration_manager' && widget?.url) {
            const existing = managers.some((m) => m.uiUrl === widget.url);
            if (!existing) {
              managers.push({
                apiUrl: widget.data?.api_url || widget.url,
                uiUrl: widget.url,
              });
            }
          }
        }
      );
    }
  } catch {
    // ignore malformed widget account data
  }

  if (managers.length === 0) {
    return DEFAULT_MANAGERS;
  }

  return managers;
}

async function getScalarToken(mx: MatrixClient, apiUrl: string): Promise<string | null> {
  try {
    const openIdToken = await mx.getOpenIdToken();

    const resp = await fetch(`${apiUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(openIdToken),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    return data?.scalar_token ?? null;
  } catch {
    return null;
  }
}

export function buildIntegrationManagerUrl(
  uiUrl: string,
  scalarToken: string | null,
  roomId: string,
  screen?: string,
  integId?: string
): string {
  const url = new URL(uiUrl);
  url.pathname = '/index.html';
  if (scalarToken) url.searchParams.set('scalar_token', scalarToken);
  url.searchParams.set('room_id', roomId);
  if (screen) url.searchParams.set('screen', screen);
  if (integId) url.searchParams.set('integ_id', integId);
  return url.toString();
}

export type IntegrationManagerState = {
  managers: IntegrationManager[];
  scalarToken: string | null;
  loading: boolean;
  error: string | null;
};

export function useIntegrationManager(): IntegrationManagerState & {
  refresh: () => void;
} {
  const mx = useMatrixClient();
  const [state, setState] = useState<IntegrationManagerState>({
    managers: [],
    scalarToken: null,
    loading: true,
    error: null,
  });

  const loadManagers = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const managers = await discoverManagers(mx);
      let scalarToken: string | null = null;

      if (managers.length > 0 && managers[0]) {
        scalarToken = await getScalarToken(mx, managers[0].apiUrl);
      }

      setState({
        managers,
        scalarToken,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState({
        managers: [],
        scalarToken: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load integration managers',
      });
    }
  }, [mx]);

  useEffect(() => {
    loadManagers();
  }, [loadManagers]);

  return { ...state, refresh: loadManagers };
}
