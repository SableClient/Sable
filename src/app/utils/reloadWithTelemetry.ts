import * as Sentry from '@sentry/react';

export const recordReloadRequested = (reason: string, data?: Record<string, unknown>): void => {
  Sentry.addBreadcrumb({
    category: 'app.reload',
    message: 'Forced reload requested',
    level: 'warning',
    data: {
      reason,
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
      online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
      ...data,
    },
  });
  Sentry.metrics.count('sable.app.reload_requested', 1, {
    attributes: { reason },
  });
};

export const reloadWithTelemetry = (reason: string, data?: Record<string, unknown>): void => {
  recordReloadRequested(reason, data);
  window.location.reload();
};
