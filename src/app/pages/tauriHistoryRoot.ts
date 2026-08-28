import { isTauri } from '@tauri-apps/api/core';
import type { HashRouterConfig } from '$hooks/useClientConfig';
import { createLogger } from '$utils/debug';
import {
  HOME_PATH,
  LOGIN_PATH,
  REGISTER_PATH,
  RESET_PASSWORD_PATH,
  ROOT_PATH,
  SSO_CALLBACK_PATH,
} from './paths';
import { getAppPathFromHref, getOriginBaseUrl } from './pathUtils';

const log = createLogger('tauriHistoryRoot');

export function ensureTauriHistoryRoot(hashRouter?: HashRouterConfig): void {
  if (!isTauri()) return;
  if (window.history.length > 1) return;
  const state = (window.history.state ?? {}) as { idx?: number };
  if (state.idx) return;

  const appPath = getAppPathFromHref(getOriginBaseUrl(hashRouter), window.location.href);
  const pathname = appPath.split('?')[0] ?? '';
  if (
    !pathname ||
    pathname === ROOT_PATH ||
    pathname === HOME_PATH ||
    pathname.startsWith(LOGIN_PATH) ||
    pathname.startsWith(REGISTER_PATH) ||
    pathname.startsWith(RESET_PASSWORD_PATH) ||
    pathname.startsWith(SSO_CALLBACK_PATH)
  ) {
    return;
  }

  const homeHref = hashRouter?.enabled
    ? `#${(hashRouter.basename ?? '/').replace(/\/$/, '')}${HOME_PATH}`
    : `${import.meta.env.BASE_URL}${HOME_PATH.slice(1)}`;

  const currentHref = window.location.href;
  window.history.replaceState(state, '', homeHref);
  window.history.pushState({ ...state, idx: 1 }, '', currentHref);
  log.log('Placed home under the initial deep-link entry', currentHref);
}
