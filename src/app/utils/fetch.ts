import { invoke, isTauri } from '@tauri-apps/api/core';

type AppFetch = typeof globalThis.fetch;

type HostFetchRequest = {
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

type NativeFetchMeta = {
  status: number;
  statusText: string;
  url: string;
  headers: [string, string][];
};

const nativeFetch: AppFetch = (input, init) => globalThis.fetch(input, init);
const ABSOLUTE_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const createRequestId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `host-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const isSameOriginUrl = (url: URL): boolean => url.origin === window.location.origin;

const isLoopbackHost = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '::1' ||
  hostname === '[::1]';

const isNetworkUrl = (url: URL): boolean => url.protocol === 'http:' || url.protocol === 'https:';

// Tauri custom-protocol hosts (`<scheme>.localhost`) are served by the webview, not the network.
const isTauriProtocolHost = (hostname: string): boolean => hostname.endsWith('.localhost');

// https://fetch.spec.whatwg.org/#null-body-status
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

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

async function buildHostRequest(
  input: RequestInfo | URL,
  requestId: string,
  init?: RequestInit
): Promise<HostFetchRequest> {
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

/**
 * Runs a fetch in the Rust host over IPC, wiring the caller's `AbortSignal` to the matching
 * host-side abort command.
 */
async function hostFetch<T>(
  command: string,
  abortCommand: string,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const signal = getAbortSignal(input, init);
  throwIfAborted(signal);

  const requestId = createRequestId();
  const request = await buildHostRequest(input, requestId, init);
  throwIfAborted(signal);
  const handleAbort = () => {
    // Best-effort cancellation. A completed request may already be gone.
    invoke(abortCommand, { requestId }).catch(() => undefined);
  };

  signal?.addEventListener('abort', handleAbort, { once: true });

  try {
    return await raceWithAbort(invoke<T>(command, { request }), signal);
  } finally {
    signal?.removeEventListener('abort', handleAbort);
  }
}

async function loopbackFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await hostFetch<LoopbackFetchResponse>(
    'loopback_fetch',
    'abort_loopback_fetch',
    input,
    init
  );

  return new Response(new Uint8Array(response.body), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

const toBytes = (raw: ArrayBuffer | number[]): Uint8Array<ArrayBuffer> =>
  raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw);

/**
 * Decodes `[u32 LE metadata length][metadata JSON][body bytes]`. The host frames the whole
 * response into one raw IPC payload so reading a body costs a single round trip, unlike
 * plugin-http which invokes once per body chunk.
 */
function decodeNativeFetchResponse(raw: ArrayBuffer | number[]): Response {
  const bytes = toBytes(raw);
  const metaLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    0,
    true
  );
  const meta = JSON.parse(
    new TextDecoder().decode(bytes.subarray(4, 4 + metaLength))
  ) as NativeFetchMeta;
  const body = bytes.subarray(4 + metaLength);
  const hasBody = body.byteLength > 0 && !NULL_BODY_STATUSES.has(meta.status);

  const response = new Response(hasBody ? body : null, {
    status: meta.status,
    statusText: meta.statusText,
    headers: meta.headers,
  });
  // `Response.url` is read by matrix-js-sdk and cannot be set via the constructor.
  Object.defineProperty(response, 'url', { value: meta.url, writable: false });
  return response;
}

async function nativeHostFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const raw = await hostFetch<ArrayBuffer | number[]>(
    'native_fetch',
    'abort_native_fetch',
    input,
    init
  );

  return decodeNativeFetchResponse(raw);
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

  if (!isNetworkUrl(url) || isSameOriginUrl(url) || isTauriProtocolHost(url.hostname)) {
    return nativeFetch(input, init);
  }

  if (isLoopbackHost(url.hostname)) {
    return loopbackFetch(request);
  }

  return nativeHostFetch(request);
};
