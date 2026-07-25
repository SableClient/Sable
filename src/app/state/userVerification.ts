import type { VerificationRequest } from '$types/matrix-sdk';
import { atom } from 'jotai';

export type UserVerificationState = {
  userId: string;
  dmRoomId: string;
  request: VerificationRequest;
};

export const userVerificationAtom = atom<UserVerificationState | undefined>(undefined);
