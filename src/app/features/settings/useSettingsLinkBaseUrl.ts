import { useMemo } from 'react';
import { useClientConfig } from '$hooks/useClientConfig';
import { getOriginBaseUrl } from '$pages/pathUtils';

export const useSettingsLinkBaseUrl = (): string => {
  const clientConfig = useClientConfig();

  return useMemo(() => getOriginBaseUrl(clientConfig.hashRouter), [clientConfig.hashRouter]);
};
