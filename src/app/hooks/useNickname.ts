import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';

import { nicknamesAtom, setNicknameAtom } from '$state/nicknames';
import { useAccountDataCallback } from './useAccountDataCallback';
import { useMatrixClient } from './useMatrixClient';
import { CustomAccountDataEvent } from '$types/matrix/accountData';

export const useNickname = (userId: string): string | undefined => {
  const nicknames = useAtomValue(nicknamesAtom);
  return nicknames[userId];
};

export const useSetNickname = () => {
  const mx = useMatrixClient();
  const setNick = useSetAtom(setNicknameAtom);

  return useCallback(
    (userId: string, nick: string | undefined) => {
      setNick(userId, nick, mx);
    },
    [mx, setNick]
  );
};

export const useSyncNicknames = (mx?: MatrixClient) => {
  const setNicknames = useSetAtom(nicknamesAtom);

  useEffect(() => {
    if (!mx) return;
    const event = mx.getAccountData(CustomAccountDataEvent.SableNicknames);
    if (event) {
      setNicknames(event.getContent() || {});
    }
  }, [mx, setNicknames]);

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === (CustomAccountDataEvent.SableNicknames as string)) {
          setNicknames(mEvent.getContent() || {});
        }
      },
      [setNicknames]
    )
  );
};
