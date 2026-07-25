import { makeStringSetAtom } from './utils/stringSetAtom';
import type { StringSetAtom } from './utils/stringSetAtom';

const CLOSED_LOBBY_CATEGORY = 'closedLobbyCategories';

export type ClosedLobbyCategoriesAtom = StringSetAtom;

export const makeClosedLobbyCategoriesAtom = (userId: string): ClosedLobbyCategoriesAtom =>
  makeStringSetAtom(`${CLOSED_LOBBY_CATEGORY}${userId}`);

export const makeLobbyCategoryId = (...args: string[]): string => args.join('|');
