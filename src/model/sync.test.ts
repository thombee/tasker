import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyState } from './store';
import {
  createGist,
  deleteCaptures,
  getSyncBase,
  getSyncConfig,
  isEmptyData,
  postCapture,
  readRemote,
  saveSyncBase,
  saveSyncConfig,
  serializeSpaces,
  syncConfigured,
  writeRemote,
} from './sync';
import { AppState } from './types';

const TOKEN = 'good';

function goal(id: string, title: string): AppState {
  return {
    ...emptyState,
    tasks: {
      [id]: {
        id,
        title,
        status: 'todo',
        parentId: null,
        childIds: [],
        notes: '',
        estimateMinutes: null,
        createdAt: 0,
        completedAt: null,
      },
    },
    rootIds: [id],
  };
}

// A tiny in-memory GitHub Gist server behind a mocked global fetch.
function installFakeGistServer() {
  const gists: Record<string, Record<string, { content: string }>> = {};
  let n = 1;
  const resp = (status: number, body: string) => ({
    status,
    text: async () => body,
  });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== `Bearer ${TOKEN}`) {
      return resp(401, JSON.stringify({ message: 'Bad credentials' }));
    }
    if (url.endsWith('/gists') && method === 'POST') {
      const id = `g${n++}`;
      gists[id] = JSON.parse(init!.body as string).files;
      return resp(201, JSON.stringify({ id }));
    }
    const m = url.match(/\/gists\/([^/]+)$/);
    if (m) {
      const id = m[1];
      if (!gists[id]) return resp(404, JSON.stringify({ message: 'Not Found' }));
      if (method === 'GET') {
        return resp(200, JSON.stringify({ id, files: gists[id] }));
      }
      if (method === 'PATCH') {
        const files = JSON.parse(init!.body as string).files as Record<
          string,
          { content: string } | null
        >;
        for (const [name, val] of Object.entries(files)) {
          // GitHub deletes a file when its value is null.
          if (val === null) delete gists[id][name];
          else gists[id][name] = val;
        }
        return resp(200, JSON.stringify({ id, files: gists[id] }));
      }
    }
    return resp(400, 'unexpected');
  });
  vi.stubGlobal('fetch', fetchMock);
  return { gists, fetchMock };
}

// In-memory localStorage for config/base persistence.
function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
}

describe('serializeSpaces', () => {
  it('ignores the active space (a device-local view preference)', () => {
    const a = { work: goal('w', 'W'), life: emptyState, active: 'work' as const };
    const b = { work: goal('w', 'W'), life: emptyState, active: 'life' as const };
    expect(serializeSpaces(a)).toBe(serializeSpaces(b));
  });

  it('changes when task data changes', () => {
    const a = { work: emptyState, life: emptyState };
    const b = { work: goal('w', 'W'), life: emptyState };
    expect(serializeSpaces(a)).not.toBe(serializeSpaces(b));
  });
});

describe('isEmptyData', () => {
  it('is true only when both spaces have no goals', () => {
    expect(isEmptyData({ work: emptyState, life: emptyState })).toBe(true);
    expect(isEmptyData({ work: goal('w', 'W'), life: emptyState })).toBe(false);
  });
});

describe('gist API round-trip', () => {
  beforeEach(() => {
    installFakeGistServer();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates, reads back, and updates a gist', async () => {
    const seed = { work: goal('w', 'Work goal'), life: emptyState };
    const created = await createGist(TOKEN, seed);
    expect(created.ok).toBe(true);
    const gistId = created.gistId!;

    const cfg = { token: TOKEN, gistId };
    const read1 = await readRemote(cfg);
    expect(read1.ok).toBe(true);
    expect(read1.payload?.spaces.work.rootIds).toEqual(['w']);

    // Write new content and read it back.
    const next = { work: goal('w', 'Work goal'), life: goal('l', 'Life goal') };
    const wrote = await writeRemote(cfg, next);
    expect(wrote.ok).toBe(true);
    const read2 = await readRemote(cfg);
    expect(read2.payload?.spaces.life.rootIds).toEqual(['l']);
    expect(read2.payload!.updatedAt).toBe(wrote.updatedAt);
  });

  it('reports a bad token as an error, not a crash', async () => {
    const res = await readRemote({ token: 'wrong', gistId: 'g1' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('401');
  });

  it('reports a missing gist as a 404 error', async () => {
    const res = await readRemote({ token: TOKEN, gistId: 'nope' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('404');
  });

  it('posts, reads, and deletes phone captures without touching task data', async () => {
    const seed = { work: goal('w', 'Work goal'), life: emptyState };
    const gistId = (await createGist(TOKEN, seed)).gistId!;
    const cfg = { token: TOKEN, gistId };

    // Phone drops a Life capture and a Work capture.
    await postCapture(cfg, 'buy oat milk'); // defaults to life
    await postCapture(cfg, 'file expenses', 'work');

    const read = await readRemote(cfg);
    expect(read.captures).toHaveLength(2);
    const life = read.captures!.find((c) => c.space === 'life');
    const work = read.captures!.find((c) => c.space === 'work');
    expect(life?.text).toBe('buy oat milk');
    expect(work?.text).toBe('file expenses');
    // The task data file is still intact and readable alongside captures.
    expect(read.payload?.spaces.work.rootIds).toEqual(['w']);

    // Draining deletes only the capture files.
    const del = await deleteCaptures(cfg, read.captures!.map((c) => c.name));
    expect(del.ok).toBe(true);
    const after = await readRemote(cfg);
    expect(after.captures ?? []).toHaveLength(0);
    expect(after.payload?.spaces.work.rootIds).toEqual(['w']);
  });

  it('routes a cap_gripe_ file to the gripe log, not a Backlog', async () => {
    const gistId = (await createGist(TOKEN, { work: emptyState, life: emptyState })).gistId!;
    const cfg = { token: TOKEN, gistId };
    await postCapture(cfg, 'the fridge hums', 'gripe');
    const read = await readRemote(cfg);
    expect(read.captures).toHaveLength(1);
    expect(read.captures![0].kind).toBe('gripe');
    expect(read.captures![0].text).toBe('the fridge hums');
  });

  it('round-trips gripes through the synced payload', async () => {
    const gripes = [
      { id: 'g1', text: 'slow lifts', createdAt: 1, resolvedAt: null, resolution: null },
    ];
    const gistId = (await createGist(TOKEN, { work: emptyState, life: emptyState, gripes }))
      .gistId!;
    const read = await readRemote({ token: TOKEN, gistId });
    expect(read.payload?.spaces.gripes).toEqual(gripes);
  });
});

describe('config + base persistence', () => {
  beforeEach(() => {
    installLocalStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips config and treats token+gist as configured', () => {
    expect(syncConfigured(getSyncConfig())).toBe(false);
    saveSyncConfig({ token: 'ghp_x', gistId: 'g1' });
    const c = getSyncConfig();
    expect(c.token).toBe('ghp_x');
    expect(c.gistId).toBe('g1');
    expect(syncConfigured(c)).toBe(true);
  });

  it('persists the sync base timestamp', () => {
    expect(getSyncBase()).toBe(0);
    saveSyncBase(12345);
    expect(getSyncBase()).toBe(12345);
  });
});
