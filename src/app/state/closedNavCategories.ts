import { makeStringSetAtom } from './utils/stringSetAtom';
import type { StringSetAtom } from './utils/stringSetAtom';

const CLOSED_NAV_CATEGORY = 'closedNavCategories';

export type ClosedNavCategoriesAtom = StringSetAtom;

export const makeClosedNavCategoriesAtom = (userId: string): ClosedNavCategoriesAtom =>
  makeStringSetAtom(`${CLOSED_NAV_CATEGORY}${userId}`);

export const makeNavCategoryId = (...args: string[]): string => args.join('|');
