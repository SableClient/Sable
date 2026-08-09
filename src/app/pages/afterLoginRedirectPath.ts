import { trimLeadingSlash } from '$utils/common';

const AFTER_LOGIN_REDIRECT_PATH_KEY = 'after_login_redirect_url';

const AUTH_PATH_SEGMENTS = new Set(['login', 'register', 'reset-password']);

// A malformed auth path such as "/login/http:/host:8008" falls through to a room route, so
// auth paths and off-site URLs are never kept as an after-login destination.
const isRedirectablePath = (path: string): boolean => {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  const firstSegment = trimLeadingSlash(path).split('/')[0] ?? '';
  return firstSegment !== '' && !AUTH_PATH_SEGMENTS.has(firstSegment);
};

export const setAfterLoginRedirectPath = (url: string): void => {
  if (!isRedirectablePath(url)) return;
  localStorage.setItem(AFTER_LOGIN_REDIRECT_PATH_KEY, url);
};
export const getAfterLoginRedirectPath = (): string | undefined => {
  const url = localStorage.getItem(AFTER_LOGIN_REDIRECT_PATH_KEY);
  if (!url || !isRedirectablePath(url)) return undefined;
  return url;
};
export const deleteAfterLoginRedirectPath = (): void => {
  localStorage.removeItem(AFTER_LOGIN_REDIRECT_PATH_KEY);
};
