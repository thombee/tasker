import { useState } from 'react';
import { SyncState } from '../hooks/useGistSync';
import { AppState } from '../model/types';
import {
  clearSync,
  createGist,
  getSyncConfig,
  saveSyncConfig,
} from '../model/sync';

interface Props {
  syncState: SyncState;
  spacesData: { work: AppState; life: AppState };
  onChanged: () => void;
}

function fmtTime(t: number | null): string {
  if (!t) return '';
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function SyncSettings({ syncState, spacesData, onChanged }: Props) {
  const initial = getSyncConfig();
  const [token, setToken] = useState(initial.token);
  const [gistId, setGistId] = useState(initial.gistId);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const configured = !!(token.trim() && gistId.trim());

  function connect() {
    saveSyncConfig({ token, gistId });
    setNote(null);
    onChanged();
  }

  async function makeGist() {
    if (!token.trim()) {
      setNote('Paste a GitHub token first.');
      return;
    }
    setBusy(true);
    setNote('creating private gist…');
    const res = await createGist(token.trim(), spacesData);
    setBusy(false);
    if (res.ok && res.gistId) {
      setGistId(res.gistId);
      saveSyncConfig({ token, gistId: res.gistId });
      setNote('gist created — this device is now the source. Paste the same token + gist id on your other device.');
      onChanged();
    } else {
      setNote(`couldn't create gist — ${res.error}`);
    }
  }

  function disconnect() {
    clearSync();
    setToken('');
    setGistId('');
    setNote('sync turned off on this device. Your tasks stay here.');
    onChanged();
  }

  const statusText = (() => {
    switch (syncState.phase) {
      case 'off':
        return null;
      case 'connecting':
        return 'connecting…';
      case 'saving':
        return 'saving…';
      case 'synced':
        return `synced ✓${syncState.lastSyncedAt ? ` · ${fmtTime(syncState.lastSyncedAt)}` : ''}`;
      case 'error':
        return `sync error — ${syncState.error}`;
    }
  })();

  return (
    <div className="backup-section">
      <p className="muted small">
        Sync across devices (optional): keeps <strong>both Work and Life</strong>{' '}
        in a private GitHub Gist. Make a token with only the <strong>gist</strong>{' '}
        scope at{' '}
        <button
          className="link inline"
          onClick={() => window.open('https://github.com/settings/tokens/new?scopes=gist&description=tasker%20sync', '_blank')}
        >
          github.com/settings/tokens
        </button>
        , paste it below, then <strong>Create private gist</strong> on this
        device. On your other device paste the same token and the gist id.
        Edits on the most-recently-saved device win a conflict.
      </p>
      <div className="row backup">
        <input
          type="password"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setNote(null);
          }}
          placeholder="GitHub token (gist scope) ghp_…"
        />
      </div>
      <div className="row backup">
        <input
          value={gistId}
          onChange={(e) => {
            setGistId(e.target.value);
            setNote(null);
          }}
          placeholder="Gist id (from your other device)"
        />
        <button
          className="ghost"
          disabled={busy || !gistId.trim() || !token.trim()}
          onClick={connect}
          title="Connect to a gist you already created on another device"
        >
          Connect
        </button>
        <button
          className="ghost"
          disabled={busy || !token.trim()}
          onClick={makeGist}
          title="Create a brand-new private gist seeded with this device's tasks"
        >
          Create private gist
        </button>
      </div>
      {(statusText || note) && (
        <p className="muted small">
          {statusText && <span className={`sync-status sync-${syncState.phase}`}>{statusText}</span>}
          {statusText && note ? ' — ' : ''}
          {note}
        </p>
      )}
      {configured && syncState.phase !== 'off' && (
        <p className="muted small">
          <button className="link inline" onClick={disconnect}>
            Turn off sync on this device
          </button>
        </p>
      )}
    </div>
  );
}
