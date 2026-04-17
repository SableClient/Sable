import { useCallback } from 'react';
import { AsyncStatus, useAsyncCallbackValue } from './useAsyncCallback';
import { useMatrixClient } from './useMatrixClient';

type RefreshHandler = () => void;

type EmailNotificationResult = {
  enabled: boolean;
  email?: string;
};

export const useEmailNotifications = (): [
  EmailNotificationResult | undefined | null,
  RefreshHandler,
] => {
  const mx = useMatrixClient();

  const [emailState, refresh] = useAsyncCallbackValue<EmailNotificationResult, Error>(
    useCallback(async () => {
      const tpIDs = (await mx.getThreePids())?.threepids;
      const emailAddresses = tpIDs
        .filter((id) => (id.medium as string) === 'email')
        .map((id) => id.address);
      if (emailAddresses.length === 0)
        return {
          enabled: false,
        };

      const pushers = (await mx.getPushers())?.pushers;
      const emailPusher = pushers.find(
        (pusher) => pusher.app_id === 'm.email' && emailAddresses.includes(pusher.pushkey)
      );

      if (emailPusher?.pushkey) {
        return {
          enabled: true,
          email: emailPusher.pushkey,
        };
      }

      return {
        enabled: false,
        email: emailAddresses[0],
      };
    }, [mx])
  );

  if (emailState.status === AsyncStatus.Success) {
    return [emailState.data, refresh];
  }

  if (emailState.status === AsyncStatus.Error) {
    return [null, refresh];
  }

  return [undefined, refresh];
};
