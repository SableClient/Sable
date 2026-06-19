import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSentryToolbar, isSentryToolbarEnabledForBuild } from './sentryToolbar';

describe('sentryToolbar', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-sentry-toolbar-state');
    delete window.SentryToolbar;
    delete window.charmSentryToolbarEnabled;
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('enables the toolbar only for preview builds with explicit config', () => {
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'preview');
    vi.stubEnv('VITE_SENTRY_TOOLBAR', 'true');
    vi.stubEnv('VITE_SENTRY_ORGANIZATION', 'cloudhubsocial');
    vi.stubEnv('VITE_SENTRY_PROJECT', 'charm');

    expect(isSentryToolbarEnabledForBuild()).toBe(true);

    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'production');
    expect(isSentryToolbarEnabledForBuild()).toBe(false);
  });

  it('marks the toolbar disabled when the build is not eligible', async () => {
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'production');
    vi.stubEnv('VITE_SENTRY_TOOLBAR', 'true');

    await expect(initSentryToolbar()).resolves.toBe(false);
    expect(document.documentElement.getAttribute('data-sentry-toolbar-state')).toBe('disabled');
    expect(window.charmSentryToolbarEnabled).toBe(false);
  });

  it('initializes the toolbar when the global SDK is already available', async () => {
    const init = vi.fn<(props: unknown) => void>();
    window.SentryToolbar = { init };
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'preview');
    vi.stubEnv('VITE_SENTRY_TOOLBAR', 'true');
    vi.stubEnv('VITE_SENTRY_ORGANIZATION', 'cloudhubsocial');
    vi.stubEnv('VITE_SENTRY_PROJECT', 'charm');
    vi.stubEnv('VITE_SENTRY_TOOLBAR_ORIGIN', 'https://sentry.io');
    vi.stubEnv('VITE_SENTRY_TOOLBAR_DEBUG', 'true');

    await expect(initSentryToolbar()).resolves.toBe(true);

    expect(init).toHaveBeenCalledWith({
      mountPoint: document.body,
      sentryOrigin: 'https://sentry.io',
      organizationSlug: 'cloudhubsocial',
      projectIdOrSlug: 'charm',
      environment: 'preview',
      domId: 'sentry-toolbar',
      placement: 'right-edge',
      theme: 'system',
      debug: true,
    });
    expect(document.documentElement.getAttribute('data-sentry-toolbar-state')).toBe('enabled');
    expect(window.charmSentryToolbarEnabled).toBe(true);
  });
});
