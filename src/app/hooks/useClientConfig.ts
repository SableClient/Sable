import { createContext, useContext } from 'react';

export type HashRouterConfig = {
  enabled?: boolean;
  basename?: string;
};

export type ExperimentConfig = {
  enabled?: boolean;
  rolloutPercentage?: number;
  variants?: string[];
  controlVariant?: string;
};

export type ExperimentSelection = {
  key: string;
  enabled: boolean;
  rolloutPercentage: number;
  variant: string;
  inExperiment: boolean;
};

export type ClientConfig = {
  defaultHomeserver?: number;
  homeserverList?: string[];
  allowCustomHomeservers?: boolean;
  elementCallUrl?: string;

  disableAccountSwitcher?: boolean;
  hideUsernamePasswordFields?: boolean;

  experiments?: Record<string, ExperimentConfig>;

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
  settingsLinkBaseUrl?: string;
};

const ClientConfigContext = createContext<ClientConfig | null>(null);

export const ClientConfigProvider = ClientConfigContext.Provider;

export function useClientConfig(): ClientConfig {
  const config = useContext(ClientConfigContext);
  if (!config) throw new Error('Client config are not provided!');
  return config;
}

const DEFAULT_CONTROL_VARIANT = 'control';

const normalizeRolloutPercentage = (value?: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 100;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
};

const hashToUInt32 = (input: string): number => {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 131 + input.charCodeAt(index)) % 4294967291;
  }
  return hash;
};

export const selectExperimentVariant = (
  key: string,
  experiment: ExperimentConfig | undefined,
  subjectId: string | undefined
): ExperimentSelection => {
  const controlVariant = experiment?.controlVariant ?? DEFAULT_CONTROL_VARIANT;
  const variants = (experiment?.variants?.filter((variant) => variant.length > 0) ?? []).filter(
    (variant) => variant !== controlVariant
  );

  const enabled = Boolean(experiment?.enabled);
  const rolloutPercentage = normalizeRolloutPercentage(experiment?.rolloutPercentage);

  if (!enabled || !subjectId || variants.length === 0 || rolloutPercentage === 0) {
    return {
      key,
      enabled,
      rolloutPercentage,
      variant: controlVariant,
      inExperiment: false,
    };
  }

  // Two independent hashes keep rollout and variant assignment stable but decorrelated.
  const rolloutBucket = hashToUInt32(`${key}:rollout:${subjectId}`) % 10000;
  const rolloutCutoff = Math.floor(rolloutPercentage * 100);
  if (rolloutBucket >= rolloutCutoff) {
    return {
      key,
      enabled,
      rolloutPercentage,
      variant: controlVariant,
      inExperiment: false,
    };
  }

  const variantIndex = hashToUInt32(`${key}:variant:${subjectId}`) % variants.length;
  return {
    key,
    enabled,
    rolloutPercentage,
    variant: variants[variantIndex],
    inExperiment: true,
  };
};

export const useExperimentVariant = (key: string, subjectId?: string): ExperimentSelection => {
  const clientConfig = useClientConfig();
  return selectExperimentVariant(key, clientConfig.experiments?.[key], subjectId);
};

export const clientDefaultServer = (clientConfig: ClientConfig): string =>
  clientConfig.homeserverList?.[clientConfig.defaultHomeserver ?? 0] ?? 'matrix.org';

export const clientAllowedServer = (clientConfig: ClientConfig, server: string): boolean => {
  const { homeserverList, allowCustomHomeservers } = clientConfig;

  if (allowCustomHomeservers) return true;

  return homeserverList?.includes(server) === true;
};
