import * as notificationsApi from './TauriNotificationsPluginApi';

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
  return {
    isPermissionGranted: notificationsApi.isPermissionGranted,
    requestPermission: notificationsApi.requestPermission,
    registerForUnifiedPush: notificationsApi.registerForUnifiedPush,
    unregisterFromUnifiedPush: notificationsApi.unregisterFromUnifiedPush,
    getUnifiedPushDistributors: notificationsApi.getUnifiedPushDistributors,
    getUnifiedPushDistributor: notificationsApi.getUnifiedPushDistributor,
    saveUnifiedPushDistributor: notificationsApi.saveUnifiedPushDistributor,
  };
}
