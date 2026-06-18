import type { Page, Route } from '@playwright/test';

type SmokeAppOptions = {
  configFailuresBeforeSuccess?: number;
  hashRouter?: boolean;
};

type StoredSessionOptions = {
  accessToken?: string;
  baseUrl?: string;
  deviceId?: string;
  userId?: string;
};

const smokeServer = 'smoke.test';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': '*',
};

const smokeConfig = (hashRouter: boolean) => ({
  defaultHomeserver: 0,
  homeserverList: [smokeServer],
  allowCustomHomeservers: false,
  hideUsernamePasswordFields: false,
  hashRouter: {
    enabled: hashRouter,
    basename: '/',
  },
});

const defaultStoredSession = (): Required<StoredSessionOptions> => ({
  accessToken: 'smoke-access-token',
  baseUrl: `https://${smokeServer}`,
  deviceId: 'SMOKEDEVICE',
  userId: '@smoke:smoke.test',
});

const fulfillJson = (route: Route, body: unknown, extraHeaders?: Record<string, string>) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: extraHeaders,
    body: JSON.stringify(body),
  });

const fulfillMatrixError = (
  route: Route,
  status: number,
  errcode: string,
  error: string,
  extraHeaders?: Record<string, string>
) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: extraHeaders,
    body: JSON.stringify({ errcode, error }),
  });

export async function installSmokeApp(page: Page, options: SmokeAppOptions = {}) {
  const { configFailuresBeforeSuccess = 0, hashRouter = true } = options;
  let configRequestCount = 0;

  await page.route('**/config.json*', async (route) => {
    configRequestCount += 1;

    if (configRequestCount <= configFailuresBeforeSuccess) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'temporary config failure' }),
      });
      return;
    }

    await fulfillJson(route, smokeConfig(hashRouter));
  });

  await page.route(`https://${smokeServer}/.well-known/matrix/client`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ errcode: 'M_NOT_FOUND', error: 'not found' }),
    });
  });

  await page.route(`https://${smokeServer}/_matrix/client/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/versions')) {
      await fulfillJson(route, { versions: ['v1.11'] }, corsHeaders);
      return;
    }

    if (url.pathname.endsWith('/login') && request.method() === 'GET') {
      await fulfillJson(
        route,
        {
          flows: [{ type: 'm.login.password' }, { type: 'm.login.token' }],
        },
        corsHeaders
      );
      return;
    }

    if (url.pathname.endsWith('/login') && request.method() === 'POST') {
      await fulfillMatrixError(route, 403, 'M_FORBIDDEN', 'Invalid login token', corsHeaders);
      return;
    }

    if (url.pathname.endsWith('/register') && request.method() === 'POST') {
      await fulfillMatrixError(route, 403, 'M_FORBIDDEN', 'Registration disabled', corsHeaders);
      return;
    }

    await fulfillMatrixError(route, 404, 'M_NOT_FOUND', 'Not found', corsHeaders);
  });

  return {
    getConfigRequestCount: () => configRequestCount,
  };
}

export async function seedStoredSession(page: Page, sessionOverrides: StoredSessionOptions = {}) {
  const session = {
    ...defaultStoredSession(),
    ...sessionOverrides,
  };

  await page.addInitScript((storedSession) => {
    localStorage.setItem('matrixSessions', JSON.stringify([storedSession]));
    localStorage.setItem('matrixActiveSession', JSON.stringify(storedSession.userId));
  }, session);

  return session;
}

export async function seedLaunchContext(page: Page, targetUrl: string) {
  await page.goto('/#/home/');
  await page.evaluate(async (url) => {
    const cache = await caches.open('sable-launch-context-v1');
    await cache.put(
      '/launch-context-meta',
      new Response(
        JSON.stringify({
          source: 'notification_click',
          clickedAt: Date.now(),
          targetUrl: url,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
  }, targetUrl);
}
