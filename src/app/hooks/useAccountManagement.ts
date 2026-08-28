import { useMemo } from 'react';
import type { ValidatedAuthMetadata } from '$types/matrix-sdk';

export const getAccountManagementUrl = (
  metadata: ValidatedAuthMetadata | undefined,
  action: string,
  deviceId?: string,
  homeserverUrl?: string
): string | undefined => {
  if (!metadata?.account_management_uri) return undefined;

  const url = new URL(metadata.account_management_uri, homeserverUrl);
  if (metadata.account_management_actions_supported?.includes(action)) {
    url.searchParams.set('action', action);
    if (deviceId) url.searchParams.set('device_id', deviceId);
  }
  return url.toString();
};

export const useAccountManagementActions = () => {
  const actions = useMemo(
    () => ({
      profile: 'org.matrix.profile',
      sessionsList: 'org.matrix.devices_list',
      sessionView: 'org.matrix.device_view',
      sessionEnd: 'org.matrix.device_delete',
      accountDeactivate: 'org.matrix.account_deactivate',
      crossSigningReset: 'org.matrix.cross_signing_reset',
    }),
    []
  );

  return actions;
};
