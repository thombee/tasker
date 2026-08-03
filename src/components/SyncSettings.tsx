import { useState } from 'react';
import { SyncState } from '../hooks/useGistSync';
import {
  captureEnabled,
  clearSync,
  createGist,
  getSyncConfig,
  postCapture,
  saveSyncConfig,
  setCaptureEnabled,
  SyncedSpaces,
} from '../model/sync';

interface Props {
  syncState: SyncState;
  spacesData: SyncedSpaces;
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
  const [capOn, setCapOn] = useState(captureEnabled);
  const [capNote, setCapNote] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  const configured = !!(token.trim() && gistId.trim());

  async function sendTestCapture() {
    setCapNote('sending…');
    const res = await postCapture({ token: token.trim(), gistId: gistId.trim() }, 'Test capture from phone ✓');
    setCapNote(
      res.ok
        ? "sent — it lands in Life's Backlog within ~10s (if this device is receiving)."
        : `couldn't send — ${res.error}`,
    );
  }

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
        <div className="capture-box">
          <p className="muted small">
            <strong>Phone brain-dump → Life.</strong> From your phone, one tap
            drops a thought straight into <strong>Life's Backlog</strong> here —
            it rides the same private gist, so nothing new to set up but a
            shortcut on your phone.
          </p>
          <label className="capture-toggle small">
            <input
              type="checkbox"
              checked={capOn}
              onChange={(e) => {
                setCapOn(e.target.checked);
                setCaptureEnabled(e.target.checked);
              }}
            />{' '}
            Receive phone captures on this device
            <span className="muted"> — if you sync several computers, keep this on for just one.</span>
          </label>
          <div className="row backup">
            <button className="ghost" onClick={sendTestCapture}>
              Send test capture
            </button>
            <button className="link inline" onClick={() => setShowSetup((s) => !s)}>
              {showSetup ? 'hide phone setup' : 'how to set up my phone'}
            </button>
          </div>
          {capNote && <p className="muted small">{capNote}</p>}
          {showSetup && (
            <div className="capture-setup muted small">
              <p>
                <strong>iPhone (Shortcuts app):</strong> make a shortcut with two
                actions —
              </p>
              <ol>
                <li>
                  <em>Ask for Input</em> (Text) — your brain-dump.
                </li>
                <li>
                  <em>Get Contents of URL</em> —{' '}
                  <code>https://api.github.com/gists/{gistId || 'YOUR_GIST_ID'}</code>,
                  Method <code>PATCH</code>, Header{' '}
                  <code>Authorization: Bearer YOUR_TOKEN</code>, Request Body{' '}
                  <em>JSON</em>:
                  <pre>{`{ "files": { "cap_life_[Current Date].txt": { "content": "[Provided Input]" } } }`}</pre>
                  (put the <em>Current Date</em> and <em>Provided Input</em>{' '}
                  variables where shown; the filename just needs to start with{' '}
                  <code>cap_life_</code> and be unique.)
                </li>
              </ol>
              <p>
                Add it to your Home Screen or the Share Sheet. <strong>Android:</strong>{' '}
                the free <em>HTTP Shortcuts</em> app does the same PATCH. Test it,
                then watch it appear in Life. Keep the token secret — anyone with
                it can read this gist.
              </p>
            </div>
          )}
          <p className="muted small">
            <button className="link inline" onClick={disconnect}>
              Turn off sync on this device
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
