import { AppState } from './types';

// A FileSystemFileHandle can't live in localStorage (it's not serializable),
// so the chosen file handle is kept in IndexedDB and re-checked on startup.

const DB_NAME = 'tasker-backup';
const STORE = 'handles';
const KEY = 'backup-file';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getSavedHandle(): Promise<FileSystemFileHandle | null> {
  const db = await openDb();
  const handle = await request(
    db.transaction(STORE).objectStore(STORE).get(KEY),
  );
  db.close();
  return (handle as FileSystemFileHandle | undefined) ?? null;
}

export async function saveHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb();
  await request(
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, KEY),
  );
  db.close();
}

export async function clearHandle(): Promise<void> {
  const db = await openDb();
  await request(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY));
  db.close();
}

export async function writeStateToFile(
  handle: FileSystemFileHandle,
  state: AppState,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(state, null, 2));
  await writable.close();
}

export function fileBackupSupported(): boolean {
  return typeof window !== 'undefined' && !!window.showSaveFilePicker;
}
