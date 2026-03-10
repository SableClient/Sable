// Re-exports from the local tauri-plugin-notifications package (crates/tauri-plugin-notifications/).

export {
  sendNotification,
  removeActive,
  createChannel,
  Importance,
  Visibility,
  registerForUnifiedPush,
  unregisterFromUnifiedPush,
  getUnifiedPushDistributors,
  saveUnifiedPushDistributor,
  getUnifiedPushDistributor,
  onUnifiedPushEndpoint,
  onUnifiedPushMessage,
  onUnifiedPushUnregistered,
  onUnifiedPushError,
  onUnifiedPushTempUnavailable,
} from '@choochmeque/tauri-plugin-notifications-api';

export type {
  UnifiedPushEndpoint,
  UnifiedPushPublicKeySet,
  Channel,
  MessagingStylePerson,
  MessagingStyleMessage,
  MessagingStyleConfig,
} from '@choochmeque/tauri-plugin-notifications-api';
