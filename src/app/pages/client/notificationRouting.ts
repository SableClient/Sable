export function isForegroundFocusedClient(
  visibilityState: DocumentVisibilityState,
  focused: boolean
): boolean {
  return visibilityState === 'visible' && focused;
}

export function shouldDeferInviteNotificationToPush(
  usePushNotifications: boolean,
  pushReady: boolean
): boolean {
  return usePushNotifications && pushReady;
}

export function shouldDeferMessageNotificationToPush(
  usePushNotifications: boolean,
  pushReady: boolean,
  visibilityState: DocumentVisibilityState,
  focused: boolean
): boolean {
  return usePushNotifications && pushReady && !isForegroundFocusedClient(visibilityState, focused);
}
