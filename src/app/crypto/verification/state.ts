import { VerificationPhase, VerificationMethod } from '$types/matrix-sdk';

/** Phase codes as `request_state` in the Rust engine emits them. */
export const EnginePhase = {
  Created: 0,
  Requested: 1,
  Ready: 2,
  Transitioned: 3,
  Done: 4,
  Cancelled: 5,
} as const;

/** Method codes as matrix-sdk-crypto's `VerificationMethod` orders them. */
const METHOD_BY_CODE: Record<number, string> = {
  0: VerificationMethod.Sas,
  1: VerificationMethod.ScanQrCode,
  2: VerificationMethod.ShowQrCode,
  3: VerificationMethod.Reciprocate,
};

const CODE_BY_METHOD: Record<string, number> = Object.fromEntries(
  Object.entries(METHOD_BY_CODE).map(([code, method]) => [method, Number(code)])
);

export type EngineCancelInfo = {
  cancelCode?: string;
  reason?: string;
  cancelledbyUs?: boolean;
};

export type EngineVerificationState = {
  className?: string;
  ownUserId: string;
  otherUserId: string;
  otherDeviceId?: string | null;
  flowId: string;
  roomId?: string | null;
  phase: number;
  weStarted: boolean;
  isSelfVerification: boolean;
  isPassive: boolean;
  isReady: boolean;
  isDone: boolean;
  isCancelled: boolean;
  timedOut: boolean;
  timeRemainingMillis: number;
  theirSupportedMethods?: number[] | null;
  ourSupportedMethods?: number[] | null;
  cancelInfo?: EngineCancelInfo | null;
  verification?: { className?: string; isDone?: boolean } | null;
};

export const methodFromCode = (code: number): string | undefined => METHOD_BY_CODE[code];

export const codeFromMethod = (method: string): number | undefined => CODE_BY_METHOD[method];

export const methodsFromCodes = (codes: number[] | null | undefined): string[] =>
  (codes ?? []).map(methodFromCode).filter((method): method is string => method !== undefined);

/**
 * Mirrors matrix-js-sdk's phase mapping. `accepting` is local: while the ready event is
 * in flight the request still reads as Requested though the engine says Ready.
 */
export const toVerificationPhase = (
  state: EngineVerificationState,
  local: { accepting: boolean; startedPhase?: VerificationPhase }
): VerificationPhase => {
  switch (state.phase) {
    case EnginePhase.Created:
    case EnginePhase.Requested:
      return VerificationPhase.Requested;
    case EnginePhase.Ready:
      return local.accepting ? VerificationPhase.Requested : VerificationPhase.Ready;
    case EnginePhase.Transitioned:
      return local.startedPhase ?? VerificationPhase.Started;
    case EnginePhase.Done:
      return VerificationPhase.Done;
    case EnginePhase.Cancelled:
      return VerificationPhase.Cancelled;
    default:
      throw new Error(`Unknown verification phase ${state.phase}`);
  }
};

export const isPending = (state: EngineVerificationState, phase: VerificationPhase): boolean => {
  if (state.isPassive) return false;
  return phase !== VerificationPhase.Done && phase !== VerificationPhase.Cancelled;
};

export const chosenMethod = (
  state: EngineVerificationState,
  phase: VerificationPhase
): string | null => {
  if (phase !== VerificationPhase.Started) return null;
  if (state.verification?.className === 'Sas') return VerificationMethod.Sas;
  if (state.verification?.className === 'Qr') return VerificationMethod.Reciprocate;
  return null;
};

export const otherPartySupportsMethod = (
  state: EngineVerificationState,
  method: string
): boolean => {
  // Undefined rather than empty means the other side has not spoken yet.
  if (!state.theirSupportedMethods) return false;
  const code = codeFromMethod(method);
  if (code === undefined) return false;
  return state.theirSupportedMethods.includes(code);
};

export const cancellingUserId = (state: EngineVerificationState): string | undefined => {
  if (!state.cancelInfo) return undefined;
  return state.cancelInfo.cancelledbyUs ? state.ownUserId : state.otherUserId;
};
