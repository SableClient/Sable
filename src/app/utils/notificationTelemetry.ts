export type NotificationTelemetryArea = 'push' | 'click' | 'restore' | 'send' | 'background_client';

export type NotificationTelemetryLevel = 'debug' | 'info' | 'warning' | 'error';

type NotificationTelemetryValue = string | number | boolean | null | undefined;

export type NotificationTelemetryData = Record<string, NotificationTelemetryValue>;

type NotificationTelemetryScalar = string | number | boolean;

const METRIC_STRING_ATTRIBUTE_ALLOWLIST = new Set([
  'area',
  'mode',
  'resolution',
  'reason',
  'source',
  'jump_mode',
  'root_source',
  'payload_type',
  'error_type',
]);

export function sanitizeNotificationTelemetryData(
  data?: NotificationTelemetryData
): Record<string, NotificationTelemetryScalar> | undefined {
  if (!data) return undefined;

  const entries = Object.entries(data).filter(
    (entry): entry is [string, NotificationTelemetryScalar] =>
      entry[1] !== undefined && entry[1] !== null
  );

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

export function buildNotificationBreadcrumb(
  area: NotificationTelemetryArea,
  message: string,
  data?: NotificationTelemetryData,
  level: NotificationTelemetryLevel = 'info'
) {
  return {
    category: `notification.${area}`,
    message,
    level,
    data: sanitizeNotificationTelemetryData(data),
  };
}

export function buildNotificationMetricAttributes(data?: NotificationTelemetryData) {
  const sanitized = sanitizeNotificationTelemetryData(data);
  if (!sanitized) return {};

  return Object.fromEntries(
    Object.entries(sanitized).filter(([key, value]) => {
      if (typeof value !== 'string') return true;
      return METRIC_STRING_ATTRIBUTE_ALLOWLIST.has(key);
    })
  );
}
