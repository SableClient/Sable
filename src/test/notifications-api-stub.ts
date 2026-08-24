// Test stub — vitest resolves the Tauri notifications plugin here instead of node_modules.

export const Importance = { None: 0, Min: 1, Low: 2, Default: 3, High: 4 } as const;
export const Visibility = { Secret: -1, Private: 0, Public: 1 } as const;

export const isPermissionGranted = async () => true;
export const requestPermission = async () => 'granted' as NotificationPermission;
export const sendNotification = async () => {};
export const registerForPushNotifications = async () => '';
export const unregisterForPushNotifications = async () => {};
export const listDistributors = async () => [] as string[];
export const setDistributor = async () => {};
export const setToken = async () => {};
export const createChannel = async () => {};
export const removeChannel = async () => {};
export const channels = async () => [];
export const active = async () => [];
export const removeActive = async () => {};
export const removeAllActive = async () => {};
export const pending = async () => [];
export const cancel = async () => {};
export const cancelAll = async () => {};
export const registerActionTypes = async () => {};
export const onNotificationReceived = async () => ({ unregister: () => {} });
export const onAction = async () => ({ unregister: () => {} });
export const onNotificationClicked = async () => ({ unregister: () => {} });
