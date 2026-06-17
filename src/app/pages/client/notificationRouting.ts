export function isForegroundFocusedClient(
  visibilityState: DocumentVisibilityState,
  focused: boolean
): boolean {
  return visibilityState === 'visible' && focused;
}

export function shouldDeferInviteNotificationToPush(
  usePushNotifications: boolean,
  visibilityState: DocumentVisibilityState,
  focused: boolean
): boolean {
  return usePushNotifications && !isForegroundFocusedClient(visibilityState, focused);
}

export function shouldDeferMessageNotificationToPush(
  usePushNotifications: boolean,
  visibilityState: DocumentVisibilityState,
  focused: boolean
): boolean {
  return usePushNotifications && !isForegroundFocusedClient(visibilityState, focused);
}
