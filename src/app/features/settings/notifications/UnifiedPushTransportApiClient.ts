export type UnifiedPushTransportApi = {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<NotificationPermission>;
  registerForUnifiedPush: () => Promise<{
    endpoint: string;
    instance: string;
    pubKeySet?: {
      pubKey: string;
      auth: string;
    };
  }>;
  unregisterFromUnifiedPush: () => Promise<void>;
  getUnifiedPushDistributors: () => Promise<{ distributors: string[] }>;
  getUnifiedPushDistributor: () => Promise<{ distributor: string }>;
  saveUnifiedPushDistributor: (distributor: string) => Promise<void>;
};

export async function getUnifiedPushTransportApi(): Promise<UnifiedPushTransportApi> {
  const api = await import('@sableclient/tauri-plugin-notifications-api');
  return {
    isPermissionGranted: api.isPermissionGranted,
    requestPermission: api.requestPermission,
    registerForUnifiedPush: api.registerForUnifiedPush,
    unregisterFromUnifiedPush: api.unregisterFromUnifiedPush,
    getUnifiedPushDistributors: api.getUnifiedPushDistributors,
    getUnifiedPushDistributor: api.getUnifiedPushDistributor,
    saveUnifiedPushDistributor: api.saveUnifiedPushDistributor,
  };
}
