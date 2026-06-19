const TOOLBAR_SCRIPT_ID = 'sentry-toolbar-script';
const TOOLBAR_DOM_ID = 'sentry-toolbar';
const TOOLBAR_STATE_ATTR = 'data-sentry-toolbar-state';
const TOOLBAR_SCRIPT_URL = 'https://browser.sentry-cdn.com/sentry-toolbar/latest/toolbar.min.js';

type SentryToolbarInitProps = {
  mountPoint: HTMLElement;
  sentryOrigin: string;
  organizationSlug: string;
  projectIdOrSlug: string;
  environment: string;
  domId: string;
  placement: 'right-edge' | 'left-edge';
  theme: 'system' | 'light' | 'dark';
  debug: boolean;
};

type SentryToolbarGlobal = {
  init: (props: SentryToolbarInitProps) => void | (() => void);
};

declare global {
  interface Window {
    SentryToolbar?: SentryToolbarGlobal;
    charmSentryToolbarEnabled?: boolean;
  }
}

const parseBoolean = (value: unknown): boolean =>
  typeof value === 'string' && /^(1|true|yes|on)$/i.test(value);

const setToolbarState = (state: 'disabled' | 'enabled' | 'error'): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute(TOOLBAR_STATE_ATTR, state);
  window.charmSentryToolbarEnabled = state === 'enabled';
};

const getToolbarEnvironment = (): string =>
  import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || 'development';

export const isSentryToolbarEnabledForBuild = (): boolean => {
  const environment = getToolbarEnvironment();
  return (
    environment === 'preview' &&
    parseBoolean(import.meta.env.VITE_SENTRY_TOOLBAR) &&
    typeof import.meta.env.VITE_SENTRY_ORGANIZATION === 'string' &&
    import.meta.env.VITE_SENTRY_ORGANIZATION.length > 0 &&
    typeof import.meta.env.VITE_SENTRY_PROJECT === 'string' &&
    import.meta.env.VITE_SENTRY_PROJECT.length > 0
  );
};

const loadToolbarScript = async (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (window.SentryToolbar) {
      resolve();
      return;
    }

    const existing = document.getElementById(TOOLBAR_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Sentry Toolbar.')),
        {
          once: true,
        }
      );
      return;
    }

    const script = document.createElement('script');
    script.id = TOOLBAR_SCRIPT_ID;
    script.src = TOOLBAR_SCRIPT_URL;
    script.async = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load Sentry Toolbar.')), {
      once: true,
    });
    document.head.appendChild(script);
  });

export const initSentryToolbar = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  if (!isSentryToolbarEnabledForBuild()) {
    setToolbarState('disabled');
    return false;
  }

  try {
    await loadToolbarScript();

    if (!window.SentryToolbar) {
      throw new Error('Sentry Toolbar script loaded without a global initializer.');
    }

    window.SentryToolbar.init({
      mountPoint: document.body ?? document.documentElement,
      sentryOrigin: import.meta.env.VITE_SENTRY_TOOLBAR_ORIGIN || 'https://sentry.io',
      organizationSlug: import.meta.env.VITE_SENTRY_ORGANIZATION,
      projectIdOrSlug: import.meta.env.VITE_SENTRY_PROJECT,
      environment: getToolbarEnvironment(),
      domId: TOOLBAR_DOM_ID,
      placement: 'right-edge',
      theme: 'system',
      debug: parseBoolean(import.meta.env.VITE_SENTRY_TOOLBAR_DEBUG),
    });

    setToolbarState('enabled');
    return true;
  } catch {
    setToolbarState('error');
    return false;
  }
};
