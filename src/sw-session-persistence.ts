export type PersistedSessionInfo = {
  accessToken: string;
  baseUrl: string;
  userId?: string;
  persistedAt?: number;
};

export function readPersistedSession(value: unknown): PersistedSessionInfo | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const session = value as {
    accessToken?: unknown;
    baseUrl?: unknown;
    userId?: unknown;
    persistedAt?: unknown;
  };

  if (typeof session.accessToken !== 'string' || typeof session.baseUrl !== 'string') {
    return undefined;
  }

  return {
    accessToken: session.accessToken,
    baseUrl: session.baseUrl,
    userId: typeof session.userId === 'string' ? session.userId : undefined,
    persistedAt: typeof session.persistedAt === 'number' ? session.persistedAt : undefined,
  };
}
