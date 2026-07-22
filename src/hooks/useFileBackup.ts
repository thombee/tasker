import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearHandle,
  fileBackupSupported,
  getSavedHandle,
  saveHandle,
  writeStateToFile,
} from '../model/fileBackup';
import { AppState } from '../model/types';

export type BackupStatus = 'off' | 'on' | 'paused';

export interface FileBackup {
  supported: boolean;
  status: BackupStatus;
  fileName: string | null;
  choose: () => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

// Mirrors every state change to a real file on disk (debounced), once the
// user has picked one. localStorage stays the source of truth; the file is
// the copy that survives a browser data wipe.
export function useFileBackup(state: AppState): FileBackup {
  const supported = fileBackupSupported();
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
  const [status, setStatus] = useState<BackupStatus>('off');
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!supported) return;
    getSavedHandle()
      .then(async (saved) => {
        if (!saved) return;
        setHandle(saved);
        const perm = await saved.queryPermission?.({ mode: 'readwrite' });
        setStatus(perm === 'granted' ? 'on' : 'paused');
      })
      .catch(() => {});
  }, [supported]);

  useEffect(() => {
    if (status !== 'on' || !handle) return;
    const timer = setTimeout(() => {
      writeStateToFile(handle, state).catch(() => setStatus('paused'));
    }, 800);
    return () => clearTimeout(timer);
  }, [state, handle, status]);

  const choose = useCallback(async () => {
    if (!window.showSaveFilePicker) return;
    try {
      const picked = await window.showSaveFilePicker({
        suggestedName: 'tasker-data.json',
        types: [{ description: 'tasker data', accept: { 'application/json': ['.json'] } }],
      });
      await saveHandle(picked);
      await writeStateToFile(picked, stateRef.current);
      setHandle(picked);
      setStatus('on');
    } catch {
      // Picker dismissed — nothing changes.
    }
  }, []);

  const reconnect = useCallback(async () => {
    if (!handle) return;
    const perm = await handle.requestPermission?.({ mode: 'readwrite' });
    if (perm === 'granted') {
      await writeStateToFile(handle, stateRef.current).catch(() => {});
      setStatus('on');
    }
  }, [handle]);

  const disconnect = useCallback(async () => {
    await clearHandle().catch(() => {});
    setHandle(null);
    setStatus('off');
  }, []);

  return { supported, status, fileName: handle?.name ?? null, choose, reconnect, disconnect };
}
