import { atom } from 'jotai';

// It is not particularly accurate and shouldn't be used for much else
// unless you plan major refractors
export const lastVisitedSpaceIdAtom = atom<string | undefined>(undefined);
