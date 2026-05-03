import { useMemo } from 'react';

import { useAccountData } from './useAccountData';
import { EventType } from '$types/matrix-sdk';

export type IgnoredUserListContent = {
  ignored_users?: Record<string, object>;
};

export const useIgnoredUsers = (): string[] => {
  const ignoredUserListEvt = useAccountData(EventType.IgnoredUserList);
  const ignoredUsers = useMemo(() => {
    const ignoredUsersRecord =
      ignoredUserListEvt?.getContent<IgnoredUserListContent>().ignored_users ?? {};
    return Object.keys(ignoredUsersRecord);
  }, [ignoredUserListEvt]);

  return ignoredUsers;
};
