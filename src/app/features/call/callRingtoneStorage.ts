const DB_NAME = 'sable-call-audio';
const DB_VERSION = 1;
const STORE = 'ringtones';
const CUSTOM_RINGTONE_KEY = 'custom-ringtone';
const CUSTOM_RINGBACK_KEY = 'custom-ringback';

export type StoredCallRingtone = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  savedAt: number;
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.addEventListener('error', () => reject(req.error));
    req.addEventListener('success', () => resolve(req.result));
    req.addEventListener('upgradeneeded', () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    });
  });
}

async function putCustomCallAudio(
  key: string,
  file: File,
  durationMs: number
): Promise<StoredCallRingtone> {
  const db = await openDb();
  const entry: StoredCallRingtone = {
    id: key,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    durationMs,
    savedAt: Date.now(),
    blob: file,
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.addEventListener('complete', () => resolve());
      tx.addEventListener('error', () => reject(tx.error));
    });
  } finally {
    db.close();
  }

  return entry;
}

async function getCustomCallAudio(key: string): Promise<StoredCallRingtone | undefined> {
  const db = await openDb();
  try {
    return await new Promise<StoredCallRingtone | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.addEventListener('error', () => reject(req.error));
      req.addEventListener('success', () => {
        resolve(req.result as StoredCallRingtone | undefined);
      });
    });
  } finally {
    db.close();
  }
}

async function clearCustomCallAudio(key: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.addEventListener('complete', () => resolve());
      tx.addEventListener('error', () => reject(tx.error));
    });
  } finally {
    db.close();
  }
}

export const putCustomCallRingtone = (
  file: File,
  durationMs: number
): Promise<StoredCallRingtone> => putCustomCallAudio(CUSTOM_RINGTONE_KEY, file, durationMs);

export const getCustomCallRingtone = (): Promise<StoredCallRingtone | undefined> =>
  getCustomCallAudio(CUSTOM_RINGTONE_KEY);

export const clearCustomCallRingtone = (): Promise<void> =>
  clearCustomCallAudio(CUSTOM_RINGTONE_KEY);

export const putCustomCallRingback = (
  file: File,
  durationMs: number
): Promise<StoredCallRingtone> => putCustomCallAudio(CUSTOM_RINGBACK_KEY, file, durationMs);

export const getCustomCallRingback = (): Promise<StoredCallRingtone | undefined> =>
  getCustomCallAudio(CUSTOM_RINGBACK_KEY);

export const clearCustomCallRingback = (): Promise<void> =>
  clearCustomCallAudio(CUSTOM_RINGBACK_KEY);
