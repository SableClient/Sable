import { useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { UserVerificationState } from '$state/userVerification';
import { userVerificationAtom } from '$state/userVerification';

export const useUserVerificationState = (): UserVerificationState | undefined => {
  const data = useAtomValue(userVerificationAtom);
  return data;
};

export const useSetUserVerification = (): ((state: UserVerificationState | undefined) => void) => {
  const setUserVerification = useSetAtom(userVerificationAtom);

  const set = useCallback((state: UserVerificationState | undefined) => {
    setUserVerification(state);
  }, [setUserVerification]);

  return set;
};

export const useClearUserVerification = (): () => void => {
  const setUserVerification = useSetAtom(userVerificationAtom);

  const clear = useCallback(() => {
    setUserVerification(undefined);
  }, [setUserVerification]);

  return clear;
};
