import type { MatrixClient, MatrixError } from '$types/matrix-sdk';
import { useCallback, useRef } from 'react';
import type { AsyncState } from './useAsyncCallback';
import { useAsyncCallback } from './useAsyncCallback';
import type { RequestEmailTokenCallback, RequestEmailTokenResponse } from './types';

export const usePasswordEmail = (
  mx: MatrixClient
): [AsyncState<RequestEmailTokenResponse, MatrixError>, RequestEmailTokenCallback] => {
  const sendAttemptRef = useRef(1);

  const passwordEmailCallback: RequestEmailTokenCallback = useCallback(
    async (email, clientSecret, nextLink) => {
      const sendAttempt = sendAttemptRef.current;
      sendAttemptRef.current += 1;
      const result = await mx.requestPasswordEmailToken(email, clientSecret, sendAttempt, nextLink);
      return {
        email,
        clientSecret,
        result,
      };
    },
    [mx]
  );

  const [passwordEmailState, passwordEmail] = useAsyncCallback<
    RequestEmailTokenResponse,
    MatrixError,
    Parameters<RequestEmailTokenCallback>
  >(passwordEmailCallback);

  return [passwordEmailState, passwordEmail];
};
