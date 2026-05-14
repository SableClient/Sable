import { createContext, useContext } from 'react';

import type { Settings } from '$state/settings';

export type HashRouterConfig = {
  enabled?: boolean;
  basename?: string;
};

export type ClientConfig = {
  defaultHomeserver?: number;
  homeserverList?: string[];
  allowCustomHomeservers?: boolean;
  elementCallUrl?: string;

  disableAccountSwitcher?: boolean;
  hideUsernamePasswordFields?: boolean;

  pushNotificationDetails?: {
    pushNotifyUrl?: string;
    vapidPublicKey?: string;
    webPushAppID?: string;
  };

  slidingSync?: {
    enabled?: boolean;
    proxyBaseUrl?: string;
    bootstrapClassicOnColdCache?: boolean;
    listPageSize?: number;
    timelineLimit?: number;
    pollTimeoutMs?: number;
    maxRooms?: number;
    includeInviteList?: boolean;
    probeTimeoutMs?: number;
  };

  featuredCommunities?: {
    openAsDefault?: boolean;
    spaces?: string[];
    rooms?: string[];
    servers?: string[];
  };

  hashRouter?: HashRouterConfig;

  matrixToBaseUrl?: string;

  themeCatalogBaseUrl?: string;
  themeCatalogManifestUrl?: string;
  themeCatalogApprovedHostPrefixes?: string[];

  settingsDefaults?: Partial<Settings>;
};

const ClientConfigContext = createContext<ClientConfig | null>(null);

export const ClientConfigProvider = ClientConfigContext.Provider;

export function useClientConfig(): ClientConfig {
  const config = useContext(ClientConfigContext);
  if (!config) throw new Error('Client config are not provided!');
  return config;
}

export function useOptionalClientConfig(): ClientConfig | null {
  return useContext(ClientConfigContext);
}

export const clientDefaultServer = (clientConfig: ClientConfig): string =>
  clientConfig.homeserverList?.[clientConfig.defaultHomeserver ?? 0] ?? 'matrix.org';

export const clientAllowedServer = (clientConfig: ClientConfig, server: string): boolean => {
  const { homeserverList, allowCustomHomeservers } = clientConfig;

  if (allowCustomHomeservers) return true;

  return homeserverList?.includes(server) === true;
};
