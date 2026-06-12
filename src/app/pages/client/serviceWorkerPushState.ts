import { SyncState } from '$types/matrix-sdk';

export type PushVisibilityMessage = {
  type: 'pushVisibilityResult';
  requestId: string;
  visible: boolean;
  syncHealthy: boolean;
};

export type PushInAppFallbackMessage = {
  roomId?: string;
  eventId?: string;
  userId?: string;
  title?: string;
  body?: string;
  roomName?: string;
  senderName?: string;
  navigate?: string;
};

export type PushFallbackBannerData = {
  id: string;
  title: string;
  roomName?: string;
  serverName?: string;
  senderName?: string;
  body: string;
  roomId?: string;
  eventId?: string;
  userId?: string;
  navigate?: string;
};

export const isMatrixSyncHealthy = (state: SyncState | null | undefined): boolean =>
  state === SyncState.Prepared || state === SyncState.Syncing;

export function buildPushVisibilityResult(
  requestId: string,
  visibilityState: DocumentVisibilityState,
  syncState: SyncState | null | undefined
): PushVisibilityMessage {
  const visible = visibilityState === 'visible';
  return {
    type: 'pushVisibilityResult',
    requestId,
    visible,
    syncHealthy: visible && isMatrixSyncHealthy(syncState),
  };
}

export function resolvePushFallbackBanner(
  data: PushInAppFallbackMessage,
  fallbackId: string
): PushFallbackBannerData {
  return {
    id: data.eventId ?? fallbackId,
    title: data.title ?? 'New Message',
    roomName: data.roomName,
    serverName: data.roomId?.split(':')[1],
    senderName: data.senderName,
    body: data.body ?? 'New message received.',
    roomId: data.roomId,
    eventId: data.eventId,
    userId: data.userId,
    navigate: data.navigate,
  };
}
