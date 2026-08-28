import { useCallback, useState } from 'react';

import { updateInviteList } from '$state/updateInvites';
import { useAtomValue } from 'jotai';
import { useMatrixClient } from './useMatrixClient';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import { useAccountDataCallback } from './useAccountDataCallback';

export const useDismissedInviteList = () => {
  const mx = useMatrixClient();
  const updateInvites = useAtomValue(updateInviteList);
  const [dismissedInvitesIds, setDismissedInvitesIds] = useState(
    mx.getAccountData(CustomAccountDataEvent.SableDismissedInvites)?.getContent<{
      roomIds: string[];
    }>().roomIds
  );
  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === (CustomAccountDataEvent.SableDismissedInvites as string)) {
          const newList = mx
            .getAccountData(CustomAccountDataEvent.SableDismissedInvites)
            ?.getContent<{
              roomIds: string[];
            }>().roomIds;
          setDismissedInvitesIds(newList ?? []);
        }
      },
      // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps
      [mx, updateInvites]
    )
  );
  return dismissedInvitesIds;
};
