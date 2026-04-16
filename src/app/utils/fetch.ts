import { invoke, isTauri } from '@tauri-apps/api/core';

type AppFetch = typeof globalThis.fetch;

type LoopbackFetchRequest = {
  requestId: string;
  method: string;
  url: string;
  headers: [string, string][];
  body: number[] | null;
};

type LoopbackFetchResponse = {
  status: number;
  statusText: string;
  url: string;
  headers: [string, string][];
  body: number[];
};

const nativeFetch: AppFetch = (input, init) => globalThis.fetch(input, init);
let tauriFetchPromise: Promise<AppFetch> | undefined;
const ABSOLUTE_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const createRequestId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `loopback-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const isSameOriginUrl = (url: URL): boolean => url.origin === window.location.origin;

const isLoopbackHost = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '::1' ||
  hostname === '[::1]';

const isNetworkUrl = (url: URL): boolean => url.protocol === 'http:' || url.protocol === 'https:';

const getAbortSignal = (input: RequestInfo | URL, init?: RequestInit): AbortSignal | undefined => {
  if (input instanceof Request) {
    return init?.signal ?? input.signal ?? undefined;
  }

  return init?.signal ?? undefined;
};

const createAbortError = (signal?: AbortSignal): DOMException =>
  new DOMException(
    signal?.reason instanceof Error ? signal.reason.message : 'The operation was aborted',
    'AbortError'
  );

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw createAbortError(signal);
  }
};

async function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }

  throwIfAborted(signal);

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      reject(createAbortError(signal));
    };

    signal.addEventListener('abort', handleAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener('abort', handleAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', handleAbort);
        reject(error);
      }
    );
  });
}

async function buildLoopbackRequest(
  input: RequestInfo | URL,
  requestId: string,
  init?: RequestInit
): Promise<LoopbackFetchRequest> {
  const request = new Request(input, init);
  const body = await request.arrayBuffer();
  const headers: [string, string][] = [];

  request.headers.forEach((value, key) => {
    headers.push([key, value]);
  });

  return {
    requestId,
    method: request.method,
    url: request.url,
    headers,
    body: body.byteLength > 0 ? Array.from(new Uint8Array(body)) : null,
  };
}

async function abortLoopbackFetch(requestId: string): Promise<void> {
  try {
    await invoke('abort_loopback_fetch', { requestId });
  } catch {
    // Best-effort cancellation. A completed request may already be gone.
  }
}

async function loopbackFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = getAbortSignal(input, init);
  throwIfAborted(signal);

  const requestId = createRequestId();
  const request = await buildLoopbackRequest(input, requestId, init);
  throwIfAborted(signal);
  const handleAbort = () => {
    abortLoopbackFetch(requestId).catch(() => undefined);
  };

  signal?.addEventListener('abort', handleAbort, { once: true });

  try {
    const response = await raceWithAbort(
      invoke<LoopbackFetchResponse>('loopback_fetch', { request }),
      signal
    );

    return new Response(new Uint8Array(response.body), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    signal?.removeEventListener('abort', handleAbort);
  }
}

async function getTauriFetch(): Promise<AppFetch> {
  if (!tauriFetchPromise) {
    tauriFetchPromise = import('@tauri-apps/plugin-http').then(({ fetch }) => fetch as AppFetch);
  }

  return tauriFetchPromise;
}

export const fetch: AppFetch = async (input, init) => {
  if (!isTauri()) {
    return nativeFetch(input, init);
  }

  if (typeof input === 'string' && !ABSOLUTE_SCHEME_RE.test(input) && !input.startsWith('//')) {
    return nativeFetch(input, init);
  }

  const request = new Request(input, init);
  const url = new URL(request.url, window.location.href);

  if (!isNetworkUrl(url) || isSameOriginUrl(url)) {
    return nativeFetch(input, init);
  }

  if (isLoopbackHost(url.hostname)) {
    return loopbackFetch(request);
  }

  const tauriFetch = await getTauriFetch();
  return tauriFetch(request, init);
};
