import type { LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { SERVER_SEARCH_PARAM } from './paths';

// Moves the homeserver from the old path segment to the query string. A segment holding a
// slash is dropped: it is the remains of an escaped slash the hosting rewrote, unrecoverable.
export const legacyAuthRedirectPath = (
  authPath: string,
  requestUrl: string,
  legacyServer?: string
): string => {
  const url = new URL(requestUrl);
  if (legacyServer && !legacyServer.includes('/')) {
    url.searchParams.set(SERVER_SEARCH_PARAM, legacyServer);
  }
  return `${authPath}${url.search}`;
};

export const legacyAuthLoader =
  (authPath: string) =>
  ({ params, request }: LoaderFunctionArgs) =>
    redirect(legacyAuthRedirectPath(authPath, request.url, params['*']));
