export type NotificationTelemetryArea = 'push' | 'click' | 'restore' | 'send' | 'background_client';

export type NotificationTelemetryLevel = 'debug' | 'info' | 'warning' | 'error';

type NotificationTelemetryValue = string | number | boolean | null | undefined;

export type NotificationTelemetryData = Record<string, NotificationTelemetryValue>;

type NotificationTelemetryScalar = string | number | boolean;

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
  return sanitizeNotificationTelemetryData(data) ?? {};
}
