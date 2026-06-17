export type ServiceWorkerNotificationClickData = {
  user_id?: string;
  room_id?: string;
  event_id?: string;
  navigate?: string;
  content?: {
    membership?: string;
  };
  isCall?: boolean;
};

export type NotificationClickClientSnapshot = {
  url: string;
  visibilityState?: string;
  focused?: boolean;
};

export function buildNotificationClickTargetUrl(
  scope: string,
  data: ServiceWorkerNotificationClickData
): string {
  const pushUserId = data.user_id;
  const pushRoomId = data.room_id;
  const pushEventId = data.event_id;
  const pushNavigate = typeof data.navigate === 'string' ? data.navigate : undefined;
  const isInvite = data.content?.membership === 'invite';

  if (isInvite) {
    const target = new URL('inbox/invites/', scope);
    if (pushUserId) target.searchParams.set('uid', pushUserId);
    return target.href;
  }

  if (pushUserId && pushRoomId) {
    const roomUrl = new URL(
      pushEventId
        ? `to/${encodeURIComponent(pushUserId)}/${encodeURIComponent(pushRoomId)}/${encodeURIComponent(pushEventId)}`
        : `to/${encodeURIComponent(pushUserId)}/${encodeURIComponent(pushRoomId)}`,
      scope
    );
    if (data.isCall === true) roomUrl.searchParams.set('joinCall', 'true');
    return roomUrl.href;
  }

  if (pushNavigate) return new URL(pushNavigate, scope).href;

  return new URL('inbox/notifications/', scope).href;
}

function getNotificationClickClientScore(
  client: NotificationClickClientSnapshot,
  scopeOrigin: string,
  scopePathname: string
): number {
  let score = 0;

  if (client.focused) score += 100;
  if (client.visibilityState === 'visible') score += 50;

  try {
    const target = new URL(client.url);
    if (target.origin === scopeOrigin) score += 20;
    if (target.pathname.startsWith(scopePathname)) score += 10;
    if (target.href !== 'about:blank') score += 5;
    else score -= 200;
    if (target.pathname.includes('/login')) score -= 15;
  } catch {
    // Leave unparsable URLs at the base score.
  }

  return score;
}

export function rankNotificationClickClients<T extends NotificationClickClientSnapshot>(
  clients: readonly T[],
  scope: string
): T[] {
  const scopeUrl = new URL(scope);
  return clients.toSorted((a, b) => {
    const scoreDelta =
      getNotificationClickClientScore(b, scopeUrl.origin, scopeUrl.pathname) -
      getNotificationClickClientScore(a, scopeUrl.origin, scopeUrl.pathname);
    if (scoreDelta !== 0) return scoreDelta;

    return a.url.localeCompare(b.url);
  });
}

export function didWindowClientActivationSucceed(
  client: WindowClient | null | undefined
): client is WindowClient {
  return client !== null && client !== undefined;
}
