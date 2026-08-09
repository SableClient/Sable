import { fetch } from '$utils/fetch';

/** Timeline event sends use `PUT /_matrix/client/{ver}/rooms/{roomId}/send/{type}/{txnId}`. */
const MATRIX_EVENT_SEND_PATH = /\/_matrix\/client\/[^/]+\/rooms\/[^/]+\/send\//;

const EVENT_SEND_TIMEOUT_MS = 30_000;

const requestUrl = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const requestMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
};

const isMatrixEventSend = (input: RequestInfo | URL, init?: RequestInit): boolean => {
  const method = requestMethod(input, init);
  if (method !== 'PUT') return false;
  return MATRIX_EVENT_SEND_PATH.test(new URL(requestUrl(input)).pathname);
};

const mergeAbortSignals = (signals: AbortSignal[]): AbortSignal => {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
};

/**
 * Wraps the app fetch so stalled timeline sends abort after 30s. That makes the
 * SDK mark the local echo `NOT_SENT`, which unlocks retry without a global client timeout.
 */
export const createMatrixFetch = (baseFetch: typeof fetch = fetch): typeof fetch => {
  const matrixFetch: typeof fetch = (input, init) => {
    if (!isMatrixEventSend(input, init)) {
      return baseFetch(input, init);
    }

    const timeout = AbortSignal.timeout(EVENT_SEND_TIMEOUT_MS);
    const existingSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = existingSignal ? mergeAbortSignals([existingSignal, timeout]) : timeout;

    return baseFetch(input, { ...init, signal });
  };

  return matrixFetch;
};

export const matrixFetch = createMatrixFetch();
