const DB_NAME = 'sable-call-audio';
const DB_VERSION = 1;
const STORE = 'ringtones';
const CUSTOM_RINGTONE_KEY = 'custom-ringtone';

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

export async function putCustomCallRingtone(
  file: File,
  durationMs: number
): Promise<StoredCallRingtone> {
  const db = await openDb();
  const entry: StoredCallRingtone = {
    id: CUSTOM_RINGTONE_KEY,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    durationMs,
    savedAt: Date.now(),
    blob: file,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry);
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('error', () => reject(tx.error));
  });

  return entry;
}

export async function getCustomCallRingtone(): Promise<StoredCallRingtone | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(CUSTOM_RINGTONE_KEY);
    req.addEventListener('error', () => reject(req.error));
    req.addEventListener('success', () => {
      resolve(req.result as StoredCallRingtone | undefined);
    });
  });
}

export async function clearCustomCallRingtone(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(CUSTOM_RINGTONE_KEY);
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('error', () => reject(tx.error));
  });
}
