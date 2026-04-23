import { useCallback, useEffect, useState } from 'react';
import type {
  CryptoEventHandlerMap,
  VerificationPhase,
  VerificationRequest,
  VerificationRequestEventHandlerMap,
  Verifier,
  VerifierEventHandlerMap,
} from '$types/matrix-sdk';
import { CryptoEvent, VerificationRequestEvent, VerifierEvent } from '$types/matrix-sdk';
import { useMatrixClient } from './useMatrixClient';

export const useVerificationRequestReceived = (
  onRequest: CryptoEventHandlerMap[CryptoEvent.VerificationRequestReceived]
) => {
  const mx = useMatrixClient();

  useEffect(() => {
    mx.on(CryptoEvent.VerificationRequestReceived, onRequest);
    return () => {
      mx.removeListener(CryptoEvent.VerificationRequestReceived, onRequest);
    };
  }, [mx, onRequest]);
};

export const useVerificationRequestChange = (
  request: VerificationRequest,
  onChange: VerificationRequestEventHandlerMap[VerificationRequestEvent.Change]
) => {
  useEffect(() => {
    request.on(VerificationRequestEvent.Change, onChange);
    return () => {
      request.removeListener(VerificationRequestEvent.Change, onChange);
    };
  }, [request, onChange]);
};

export const useVerificationRequestPhase = (request: VerificationRequest): VerificationPhase => {
  const [phase, setPhase] = useState(() => request.phase);

  useVerificationRequestChange(
    request,
    useCallback(() => {
      setPhase(request.phase);
    }, [request])
  );

  return phase;
};

export const useVerifierCancel = (
  verifier: Verifier,
  onCallback: VerifierEventHandlerMap[VerifierEvent.Cancel]
) => {
  useEffect(() => {
    verifier.on(VerifierEvent.Cancel, onCallback);
    return () => {
      verifier.removeListener(VerifierEvent.Cancel, onCallback);
    };
  }, [verifier, onCallback]);
};

export const useVerifierShowSas = (
  verifier: Verifier,
  onCallback: VerifierEventHandlerMap[VerifierEvent.ShowSas]
) => {
  useEffect(() => {
    verifier.on(VerifierEvent.ShowSas, onCallback);
    return () => {
      verifier.removeListener(VerifierEvent.ShowSas, onCallback);
    };
  }, [verifier, onCallback]);
};

export const useVerifierShowReciprocateQr = (
  verifier: Verifier,
  onCallback: VerifierEventHandlerMap[VerifierEvent.ShowReciprocateQr]
) => {
  useEffect(() => {
    verifier.on(VerifierEvent.ShowReciprocateQr, onCallback);
    return () => {
      verifier.removeListener(VerifierEvent.ShowReciprocateQr, onCallback);
    };
  }, [verifier, onCallback]);
};
