import { useMemo } from 'react';
import { useClientConfig } from '$hooks/useClientConfig';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { getEffectiveSettingsLinkBaseUrl } from './settingsLink';

export const useSettingsLinkBaseUrl = (): string => {
  const clientConfig = useClientConfig();
  const [settingsLinkBaseUrlOverride] = useSetting(settingsAtom, 'settingsLinkBaseUrlOverride');

  return useMemo(
    () => getEffectiveSettingsLinkBaseUrl(clientConfig, settingsLinkBaseUrlOverride),
    [clientConfig, settingsLinkBaseUrlOverride]
  );
};
