// Optional cross-device sync via a private GitHub Gist. Both spaces (Work and
// Life) live in one JSON file inside a secret gist. Reads on open, writes
// debounced after edits, polls for changes from the other device. Resolution
// is last-writer-wins guarded by a timestamp, so the most recently saved
// device wins a genuine conflict — see useGistSync for the orchestration.
//
// The GitHub token and gist id are stored locally per device (never in the
// Export/Import backup), the same as the Groq key and phone topic.

import { emptyState } from './store';
import { AppState } from './types';

const CONFIG_KEY = 'tasker.sync.v1';
const BASE_KEY = 'tasker.sync.base.v1';
const GIST_FILE = 'tasker-spaces.json';
const API = 'https://api.github.com';
const PAYLOAD_VERSION = 1;

export interface SyncConfig {
  token: string;
  gistId: string;
}

export interface RemotePayload {
  v: number;
  updatedAt: number;
  spaces: { work: AppState; life: AppState };
}

export function getSyncConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { token: '', gistId: '' };
    const c = JSON.parse(raw);
    return {
      token: typeof c.token === 'string' ? c.token : '',
      gistId: typeof c.gistId === 'string' ? c.gistId : '',
    };
  } catch {
    return { token: '', gistId: '' };
  }
}

export function saveSyncConfig(c: SyncConfig): void {
  try {
    const token = c.token.trim();
    const gistId = c.gistId.trim();
    if (token || gistId) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ token, gistId }));
    } else {
      localStorage.removeItem(CONFIG_KEY);
    }
  } catch {
    // storage unavailable
  }
}

export function syncConfigured(c: SyncConfig = getSyncConfig()): boolean {
  return !!(c.token && c.gistId);
}

// `base` is the updatedAt of the remote version this device last reconciled
// with. Persisted so a restart knows whether the gist has moved on since.
export function getSyncBase(): number {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function saveSyncBase(t: number): void {
  try {
    localStorage.setItem(BASE_KEY, String(t));
  } catch {
    // storage unavailable
  }
}

export function clearSync(): void {
  try {
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(BASE_KEY);
  } catch {
    // storage unavailable
  }
}

// Stable serialization of just the task data (not `active`, a device-local
// view preference) so two devices can compare content regardless of which
// space each is looking at.
export function serializeSpaces(spaces: { work: AppState; life: AppState }): string {
  return JSON.stringify({ work: spaces.work, life: spaces.life });
}

interface ApiResp {
  status: number;
  body: string;
}

async function api(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  token: string,
  body?: string,
): Promise<ApiResp> {
  const url = API + path;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // Prefer the desktop app's main process (no CORS, handles work proxies).
  const native = typeof window !== 'undefined' ? window.taskerNative : undefined;
  if (native?.apiCall) {
    return native.apiCall(url, { method, headers, body: body ?? '' });
  }
  const resp = await fetch(url, { method, headers, body });
  return { status: resp.status, body: await resp.text() };
}

function errorFrom(r: ApiResp): string {
  if (r.status === 401) return 'bad token (401) — check the token has gist scope';
  if (r.status === 404) return 'gist not found (404) — check the gist id and token';
  let msg = r.body.slice(0, 160);
  try {
    msg = JSON.parse(r.body).message ?? msg;
  } catch {
    // keep the raw snippet
  }
  return msg || `HTTP ${r.status}`;
}

async function rawGet(url: string, token: string): Promise<string> {
  const native = typeof window !== 'undefined' ? window.taskerNative : undefined;
  const headers = { Authorization: `Bearer ${token}` };
  if (native?.apiCall) {
    const r = await native.apiCall(url, { method: 'GET', headers, body: '' });
    return r.body;
  }
  const resp = await fetch(url, { headers });
  return resp.text();
}

export interface ReadResult {
  ok: boolean;
  payload?: RemotePayload | null; // null = gist exists but has no tasker file yet
  error?: string;
}

export async function readRemote(cfg: SyncConfig): Promise<ReadResult> {
  try {
    const r = await api('GET', `/gists/${cfg.gistId}`, cfg.token);
    if (r.status < 200 || r.status >= 300) return { ok: false, error: errorFrom(r) };
    const gist = JSON.parse(r.body);
    const file = gist.files?.[GIST_FILE];
    if (!file) return { ok: true, payload: null };
    // Files over ~1MB come back truncated with the full copy at raw_url.
    let content: string = file.content ?? '';
    if (file.truncated && file.raw_url) {
      content = await rawGet(file.raw_url, cfg.token);
    }
    if (!content.trim()) return { ok: true, payload: null };
    const payload = JSON.parse(content) as RemotePayload;
    if (!payload || typeof payload.updatedAt !== 'number' || !payload.spaces) {
      return { ok: true, payload: null };
    }
    return { ok: true, payload };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 160) };
  }
}

export interface WriteResult {
  ok: boolean;
  updatedAt?: number;
  error?: string;
}

export async function writeRemote(
  cfg: SyncConfig,
  spaces: { work: AppState; life: AppState },
): Promise<WriteResult> {
  try {
    const updatedAt = Date.now();
    const payload: RemotePayload = {
      v: PAYLOAD_VERSION,
      updatedAt,
      spaces: { work: spaces.work, life: spaces.life },
    };
    const body = JSON.stringify({
      files: { [GIST_FILE]: { content: JSON.stringify(payload) } },
    });
    const r = await api('PATCH', `/gists/${cfg.gistId}`, cfg.token, body);
    if (r.status < 200 || r.status >= 300) return { ok: false, error: errorFrom(r) };
    return { ok: true, updatedAt };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 160) };
  }
}

export interface CreateResult {
  ok: boolean;
  gistId?: string;
  error?: string;
}

// Make a fresh private gist seeded with this device's current data, so the
// device that sets up sync keeps everything it already has.
export async function createGist(
  token: string,
  spaces: { work: AppState; life: AppState },
): Promise<CreateResult> {
  try {
    const payload: RemotePayload = {
      v: PAYLOAD_VERSION,
      updatedAt: Date.now(),
      spaces: { work: spaces.work, life: spaces.life },
    };
    const body = JSON.stringify({
      description: 'tasker sync (private) — your task data across devices',
      public: false,
      files: { [GIST_FILE]: { content: JSON.stringify(payload) } },
    });
    const r = await api('POST', '/gists', token, body);
    if (r.status < 200 || r.status >= 300) return { ok: false, error: errorFrom(r) };
    const id = JSON.parse(r.body).id;
    if (typeof id !== 'string') return { ok: false, error: 'no gist id returned' };
    return { ok: true, gistId: id };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 160) };
  }
}

export function isEmptyData(spaces: { work: AppState; life: AppState }): boolean {
  return spaces.work.rootIds.length === 0 && spaces.life.rootIds.length === 0;
}

export { emptyState };
