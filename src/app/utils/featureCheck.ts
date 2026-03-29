export const checkIndexedDBSupport = async (): Promise<boolean> => {
  const ts = Date.now();
  const dbName = `checkIndexedDBSupport-${ts}`;
  return new Promise((resolve) => {
    let db;
    try {
      db = indexedDB.open(dbName);
    } catch {
      resolve(false);
      return;
    }
    db.onsuccess = () => {
      resolve(true);
      indexedDB.deleteDatabase(dbName);
    };
    db.onerror = () => {
      resolve(false);
      indexedDB.deleteDatabase(dbName);
    };
  });
};
