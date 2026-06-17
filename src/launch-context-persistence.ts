export type PersistedLaunchContext = {
  source: 'notification_click';
  clickedAt: number;
  userId?: string;
  roomId?: string;
  eventId?: string;
  targetUrl?: string;
};

const LAUNCH_CONTEXT_CACHE = 'sable-launch-context-v1';
const LAUNCH_CONTEXT_URL = '/launch-context-meta';

export function readPersistedLaunchContext(value: unknown): PersistedLaunchContext | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const context = value as {
    source?: unknown;
    clickedAt?: unknown;
    userId?: unknown;
    roomId?: unknown;
    eventId?: unknown;
    targetUrl?: unknown;
  };

  if (context.source !== 'notification_click' || typeof context.clickedAt !== 'number') {
    return undefined;
  }

  return {
    source: context.source,
    clickedAt: context.clickedAt,
    userId: typeof context.userId === 'string' ? context.userId : undefined,
    roomId: typeof context.roomId === 'string' ? context.roomId : undefined,
    eventId: typeof context.eventId === 'string' ? context.eventId : undefined,
    targetUrl: typeof context.targetUrl === 'string' ? context.targetUrl : undefined,
  };
}

export async function persistLaunchContext(context: PersistedLaunchContext): Promise<void> {
  if (!('caches' in globalThis)) return;

  const cache = await globalThis.caches.open(LAUNCH_CONTEXT_CACHE);
  await cache.put(
    LAUNCH_CONTEXT_URL,
    new Response(JSON.stringify(context), {
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

export async function clearLaunchContext(): Promise<void> {
  if (!('caches' in globalThis)) return;

  const cache = await globalThis.caches.open(LAUNCH_CONTEXT_CACHE);
  await cache.delete(LAUNCH_CONTEXT_URL);
}

export async function consumeLaunchContext(): Promise<PersistedLaunchContext | undefined> {
  if (!('caches' in globalThis)) return undefined;

  const cache = await globalThis.caches.open(LAUNCH_CONTEXT_CACHE);
  const response = await cache.match(LAUNCH_CONTEXT_URL);
  if (!response) return undefined;

  await cache.delete(LAUNCH_CONTEXT_URL);
  return readPersistedLaunchContext(await response.json());
}
