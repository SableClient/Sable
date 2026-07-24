export type UnifiedPushMessageHandler = (data: Record<string, unknown>) => Promise<void>;
export type UnifiedPushMessageErrorHandler = (error: unknown) => void;

export function createUnifiedPushMessageListener(
  handler: UnifiedPushMessageHandler,
  onError: UnifiedPushMessageErrorHandler
) {
  return (data: Record<string, unknown>) => {
    handler(data).catch(onError);
  };
}

export function parseUnifiedPushMessage(raw: unknown): Record<string, unknown> | null {
  const message = (raw as { message?: unknown })?.message;
  if (typeof message !== 'string') return null;

  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;

  const notification = (payload as { notification?: unknown }).notification;
  if (notification && typeof notification === 'object') {
    return notification as Record<string, unknown>;
  }
  return payload as Record<string, unknown>;
}
