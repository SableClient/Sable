import { useMemo } from 'react';
import { trimLeadingSlash, trimSlash, trimTrailingSlash } from '$utils/common';
import { useClientConfig } from './useClientConfig';

export const usePathWithOrigin = (
  path: string,
  options?: {
    /** OAuth redirect URIs must not contain a fragment (RFC 6749). */
    ignoreHashRouter?: boolean;
  }
): string => {
  const { hashRouter } = useClientConfig();
  const { origin } = window.location;
  const ignoreHashRouter = options?.ignoreHashRouter ?? false;

  const pathWithOrigin = useMemo(() => {
    let url: string = trimSlash(origin);

    url += `/${trimSlash(import.meta.env.BASE_URL ?? '')}`;
    url = trimTrailingSlash(url);

    if (hashRouter?.enabled && !ignoreHashRouter) {
      url += `/#/${trimSlash(hashRouter.basename ?? '')}`;
      url = trimTrailingSlash(url);
    }

    url += `/${trimLeadingSlash(path)}`;

    return url;
  }, [path, hashRouter, origin, ignoreHashRouter]);

  return pathWithOrigin;
};
