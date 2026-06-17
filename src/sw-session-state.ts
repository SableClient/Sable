export type ServiceWorkerSessionInfo = {
  accessToken: string;
  baseUrl: string;
  userId?: string;
  persistedAt?: number;
};

export function selectPersistedSessionCandidate(
  sessions: Iterable<ServiceWorkerSessionInfo>
): ServiceWorkerSessionInfo | undefined {
  for (const session of sessions) {
    return session;
  }

  return undefined;
}

export function shouldClearMediaCacheAfterSessionRemoval(
  removedAccessToken: string | undefined,
  sessions: Iterable<ServiceWorkerSessionInfo>
): boolean {
  if (!removedAccessToken) return false;

  for (const session of sessions) {
    if (session.accessToken === removedAccessToken) {
      return false;
    }
  }

  return true;
}
