import * as Sentry from '@sentry/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordReloadRequested, reloadWithTelemetry } from './reloadWithTelemetry';

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn<(breadcrumb: unknown) => void>(),
  metrics: {
    count: vi.fn<(name: string, value: number, options?: unknown) => void>(),
  },
}));

describe('reloadWithTelemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        onLine: true,
      },
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        reload: vi.fn<() => void>(),
      },
    });
  });

  it('records the reload reason and runtime state', () => {
    recordReloadRequested('sw_watchdog_unresponsive', { consecutiveMisses: 2 });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'app.reload',
      message: 'Forced reload requested',
      level: 'warning',
      data: {
        reason: 'sw_watchdog_unresponsive',
        visibilityState: 'visible',
        online: true,
        consecutiveMisses: 2,
      },
    });
    expect(Sentry.metrics.count).toHaveBeenCalledWith('sable.app.reload_requested', 1, {
      attributes: { reason: 'sw_watchdog_unresponsive' },
    });
  });

  it('records telemetry before reloading', () => {
    reloadWithTelemetry('clear_login_data', { unregisterServiceWorkers: true });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(Sentry.metrics.count).toHaveBeenCalledTimes(1);
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});
