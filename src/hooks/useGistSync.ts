import { Dispatch, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Spaces, TopAction } from '../model/store';
import {
  Capture,
  captureEnabled,
  deleteCaptures,
  getSyncBase,
  getSyncConfig,
  readRemote,
  saveSyncBase,
  serializeSpaces,
  SyncConfig,
  syncConfigured,
  writeRemote,
} from '../model/sync';

export type SyncPhase = 'off' | 'connecting' | 'synced' | 'saving' | 'error';

export interface SyncState {
  phase: SyncPhase;
  lastSyncedAt: number | null;
  error: string | null;
}

const WRITE_DEBOUNCE_MS = 1500;
const POLL_MS = 9000;

// Drives cross-device sync of both spaces through a private gist. Pulls on
// open, pushes debounced after edits, polls for the other device's changes.
// `configVersion` bumps when the user saves new sync settings, re-running the
// initial reconcile against the new gist.
export function useGistSync(
  spaces: Spaces,
  dispatch: Dispatch<TopAction>,
  configVersion: number,
): SyncState {
  const [sync, setSync] = useState<SyncState>({
    phase: syncConfigured() ? 'connecting' : 'off',
    lastSyncedAt: null,
    error: null,
  });

  const spacesRef = useRef(spaces);
  spacesRef.current = spaces;
  // The task content (serialized) currently agreed with the server. Both a
  // successful push and an applied pull update it, so the push effect below
  // never echoes a change that came from the remote.
  const syncedContentRef = useRef<string>('');
  const configRef = useRef<SyncConfig>(getSyncConfig());
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  // Capture files already handed to the reducer this session, so a fast poll
  // (or a failed delete) never adds the same thought twice.
  const drainedRef = useRef<Set<string>>(new Set());
  // Drained files whose delete hasn't succeeded yet — retried each tick so the
  // gist doesn't accumulate already-landed captures.
  const pendingDeleteRef = useRef<Set<string>>(new Set());

  const localContent = useMemo(() => serializeSpaces(spaces), [spaces]);

  // Land any pending phone brain-dumps into their space's Backlog, then delete
  // the drained files from the gist. Only the designated device drains.
  const drainCaptures = useCallback(
    async (cfg: SyncConfig, captures: Capture[] | undefined) => {
      if (!captureEnabled()) return;
      const fresh = (captures ?? []).filter((c) => !drainedRef.current.has(c.name));
      for (const c of fresh) {
        drainedRef.current.add(c.name);
        pendingDeleteRef.current.add(c.name);
        dispatch({ type: 'captureTo', space: c.space, title: c.text });
      }
      // Retry any outstanding deletes (including this batch). Tasks are never
      // re-created — only the file cleanup is retried.
      const toDelete = [...pendingDeleteRef.current];
      if (toDelete.length === 0) return;
      const res = await deleteCaptures(cfg, toDelete);
      if (res.ok) toDelete.forEach((n) => pendingDeleteRef.current.delete(n));
    },
    [dispatch],
  );

  const applyRemote = useCallback(
    (payload: { updatedAt: number; spaces: { work: Spaces['work']; life: Spaces['life'] } }) => {
      const content = serializeSpaces(payload.spaces);
      syncedContentRef.current = content;
      saveSyncBase(payload.updatedAt);
      // Keep this device's active space; only the data comes from remote.
      dispatch({
        type: 'hydrateSpaces',
        spaces: {
          work: payload.spaces.work,
          life: payload.spaces.life,
          active: spacesRef.current.active,
        },
      });
      setSync({ phase: 'synced', lastSyncedAt: payload.updatedAt, error: null });
    },
    [dispatch],
  );

  const pushNow = useCallback(async () => {
    const cfg = configRef.current;
    if (!syncConfigured(cfg) || inFlight.current) return;
    const snapshot = spacesRef.current;
    const content = serializeSpaces(snapshot);
    if (content === syncedContentRef.current) return; // nothing new
    inFlight.current = true;
    setSync((s) => ({ ...s, phase: 'saving' }));
    const res = await writeRemote(cfg, snapshot);
    inFlight.current = false;
    if (res.ok && res.updatedAt) {
      syncedContentRef.current = content;
      saveSyncBase(res.updatedAt);
      setSync({ phase: 'synced', lastSyncedAt: res.updatedAt, error: null });
    } else {
      setSync((s) => ({ ...s, phase: 'error', error: res.error ?? 'write failed' }));
    }
  }, []);

  // Initial reconcile whenever the sync config changes (incl. first mount).
  useEffect(() => {
    const cfg = getSyncConfig();
    configRef.current = cfg;
    if (!syncConfigured(cfg)) {
      setSync({ phase: 'off', lastSyncedAt: null, error: null });
      return;
    }
    let cancelled = false;
    setSync((s) => ({ ...s, phase: 'connecting', error: null }));
    (async () => {
      const res = await readRemote(cfg);
      if (cancelled) return;
      if (!res.ok) {
        setSync({ phase: 'error', lastSyncedAt: null, error: res.error ?? 'read failed' });
        return;
      }
      const base = getSyncBase();
      const localStr = serializeSpaces(spacesRef.current);
      if (!res.payload) {
        // Gist has no data yet — seed it from this device.
        syncedContentRef.current = ''; // force pushNow to send
        await pushNow();
      } else {
        const remoteStr = serializeSpaces(res.payload.spaces);
        if (remoteStr === localStr) {
          // Already identical — just record where we are.
          syncedContentRef.current = localStr;
          saveSyncBase(res.payload.updatedAt);
          setSync({ phase: 'synced', lastSyncedAt: res.payload.updatedAt, error: null });
        } else if (res.payload.updatedAt > base) {
          // Remote moved on since we last synced → take it.
          applyRemote(res.payload);
        } else {
          // We have local edits the gist hasn't seen → push them up.
          syncedContentRef.current = remoteStr; // so pushNow sees a diff
          await pushNow();
        }
      }
      if (cancelled) return;
      await drainCaptures(cfg, res.captures);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configVersion]);

  // Debounced push whenever local task content diverges from what's synced.
  useEffect(() => {
    if (!syncConfigured(configRef.current)) return;
    if (localContent === syncedContentRef.current) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      void pushNow();
    }, WRITE_DEBOUNCE_MS);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [localContent, pushNow, configVersion]);

  // Poll for the other device's changes.
  useEffect(() => {
    const cfg = configRef.current;
    if (!syncConfigured(cfg)) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || inFlight.current) return;
      const res = await readRemote(cfg);
      if (cancelled || !res.ok) return;
      if (res.payload) {
        const remoteStr = serializeSpaces(res.payload.spaces);
        if (res.payload.updatedAt > getSyncBase() && remoteStr !== syncedContentRef.current) {
          applyRemote(res.payload);
        }
      }
      await drainCaptures(cfg, res.captures);
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [applyRemote, drainCaptures, configVersion]);

  return sync;
}
