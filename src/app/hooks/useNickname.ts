import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { type MatrixClient } from '$types/matrix-sdk';
import { AccountDataEvent } from '$types/matrix/accountData';
import { nicknamesAtom, setNicknameAtom } from '$state/nicknames';
import { useAccountDataCallback } from './useAccountDataCallback';
import { useMatrixClient } from './useMatrixClient';

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
    const event = mx.getAccountData(AccountDataEvent.SableNicknames as any);
    if (event) {
      setNicknames(event.getContent() || {});
    }
  }, [mx, setNicknames]);

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === AccountDataEvent.SableNicknames) {
          setNicknames(mEvent.getContent() || {});
        }
      },
      [setNicknames]
    )
  );
};
