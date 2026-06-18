import * as Sentry from '@sentry/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordReloadRequested, reloadWithTelemetry } from './reloadWithTelemetry';

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn<(breadcrumb: unknown) => void>(),
  flush: vi.fn<(timeout?: number) => Promise<boolean>>().mockResolvedValue(true),
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

  it('flushes telemetry before reloading', async () => {
    let resolveFlush: ((value: boolean) => void) | undefined;
    vi.mocked(Sentry.flush).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveFlush = resolve;
        })
    );

    reloadWithTelemetry('clear_login_data', { unregisterServiceWorkers: true });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(Sentry.metrics.count).toHaveBeenCalledTimes(1);
    expect(Sentry.flush).toHaveBeenCalledWith(2000);
    expect(window.location.reload).not.toHaveBeenCalled();

    resolveFlush?.(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});
