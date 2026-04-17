import { atom } from 'jotai';
import type { MatrixClient } from '$types/matrix-sdk';
import { AccountDataEvent } from '$types/matrix/accountData';

export const NICKNAMES_KEY = 'sableNicknames';

export type Nicknames = Record<string, string>;

export const nicknamesAtom = atom<Nicknames>({});

export const setNicknameAtom = atom<
  null,
  [userId: string, nick: string | undefined, mx: MatrixClient],
  void
>(null, (get, set, userId, nick, mx) => {
  const prev = get(nicknamesAtom);
  const next = { ...prev };
  if (nick === undefined || nick.trim() === '') {
    delete next[userId];
  } else {
    next[userId] = nick.trim();
  }
  set(nicknamesAtom, next);

  mx.setAccountData(AccountDataEvent.SableNicknames, next);
});
