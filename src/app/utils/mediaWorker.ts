import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';

type Pending = { resolve: (value: unknown) => void; reject: (reason?: unknown) => void };

let worker: Worker | undefined;
let disabled = false;
let seq = 0;
const pending = new Map<number, Pending>();

const rejectAll = (reason: Error): void => {
  for (const entry of pending.values()) entry.reject(reason);
  pending.clear();
};

const getWorker = (): Worker | undefined => {
  if (disabled) return undefined;
  if (worker) return worker;
  if (typeof Worker === 'undefined') {
    disabled = true;
    return undefined;
  }
  try {
    worker = new Worker(new URL('../workers/media.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    disabled = true;
    return undefined;
  }
  worker.addEventListener('message', (event: MessageEvent) => {
    const { id, error, ...rest } = event.data as { id: number; error?: string };
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (error) entry.reject(new Error(error));
    else entry.resolve(rest);
  });
  worker.addEventListener('error', () => {
    rejectAll(new Error('media worker crashed'));
    worker?.terminate();
    worker = undefined;
    disabled = true;
  });
  return worker;
};

const call = <T>(message: object, transfer: Transferable[] = []): Promise<T> => {
  const active = getWorker();
  if (!active) return Promise.reject(new Error('media worker unavailable'));
  const id = (seq += 1);
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    active.postMessage({ id, ...message }, transfer);
  });
};

export const blurHashWorkerSupported = (): boolean =>
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  typeof createImageBitmap === 'function';

export const encryptBlobInWorker = (
  file: Blob
): Promise<{ blob: Blob; info: EncryptedAttachmentInfo }> =>
  call<{ blob: Blob; info: EncryptedAttachmentInfo }>({ type: 'encrypt', file });

export const encodeBlurHashInWorker = (
  bitmap: ImageBitmap,
  width: number,
  height: number
): Promise<string | undefined> =>
  call<{ hash: string | undefined }>({ type: 'blurhash', bitmap, width, height }, [bitmap]).then(
    (result) => result.hash
  );
