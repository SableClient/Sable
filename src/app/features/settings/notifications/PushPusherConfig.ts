export type PushPusherSettings = {
  useRichPushPayloads?: boolean;
  pushNotifyUrlOverride?: string;
};

export function resolvePushNotifyUrl(
  configuredUrl: string | undefined,
  override: string | undefined
): string {
  const candidate = override?.trim() || configuredUrl?.trim();
  if (!candidate)
    throw new Error('Push requires pushNotificationDetails.pushNotifyUrl in config.json.');

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Push gateway URL must be a full HTTPS URL ending in /notify.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== '/_matrix/push/v1/notify'
  ) {
    throw new Error('Push gateway URL must be an HTTPS Matrix /_matrix/push/v1/notify endpoint.');
  }
  return url.toString();
}

export function withPushPayloadFormat<T extends Record<string, unknown>>(
  data: T,
  useRichPushPayloads = false
): T | (T & { format: 'event_id_only' }) {
  return useRichPushPayloads ? data : { ...data, format: 'event_id_only' };
}
