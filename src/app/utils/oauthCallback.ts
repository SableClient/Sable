import type { HashRouterConfig } from '$hooks/useClientConfig';
import { trimSlash } from './common';

const getCallbackParams = (hash: string): URLSearchParams | undefined => {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  if (!params.has('state') || (!params.has('code') && !params.has('error'))) return undefined;
  return params;
};

export const normalizeOAuthCallbackUrl = (hashRouter?: HashRouterConfig): void => {
  const params = getCallbackParams(window.location.hash);
  if (!params) return;

  const url = new URL(window.location.href);
  url.hash = '';

  if (hashRouter?.enabled) {
    const basePath = `/${trimSlash(import.meta.env.BASE_URL ?? '')}`;
    const appPath = url.pathname.startsWith(basePath)
      ? url.pathname.slice(basePath.length)
      : url.pathname;
    const route = [hashRouter.basename, appPath]
      .map((part) => trimSlash(part ?? ''))
      .filter(Boolean)
      .join('/');
    const routeParams = new URLSearchParams(url.search);
    params.forEach((value, key) => routeParams.set(key, value));
    url.pathname = basePath;
    url.search = '';
    url.hash = `/${route}?${routeParams}`;
  } else {
    params.forEach((value, key) => url.searchParams.set(key, value));
  }

  window.history.replaceState(window.history.state, '', url);
};
