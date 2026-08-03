import { ChangeEvent, Dispatch, useRef, useState } from 'react';
import { FileBackup } from '../hooks/useFileBackup';
import { getGroqKey, saveGroqKey, testGroq } from '../model/aiSummary';
import {
  getPhoneTopic,
  pingUrl,
  savePhoneTopic,
  sendParkPingSmart,
} from '../model/phonePing';
import { SyncState } from '../hooks/useGistSync';
import { Action } from '../model/store';
import { SyncedSpaces } from '../model/sync';
import { AppState } from '../model/types';
import SyncSettings from './SyncSettings';
import TreeNode from './TreeNode';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  backup: FileBackup;
  onStartGoal: (id: string) => void;
  otherSpaceLabel: string;
  onMoveGoalToSpace: (id: string) => void;
  syncState: SyncState;
  spacesData: SyncedSpaces;
  onSyncConfigChanged: () => void;
}

export default function PlanningView({
  state,
  dispatch,
  backup,
  onStartGoal,
  otherSpaceLabel,
  onMoveGoalToSpace,
  syncState,
  spacesData,
  onSyncConfigChanged,
}: Props) {
  const [newGoal, setNewGoal] = useState('');
  const [phoneTopic, setPhoneTopic] = useState(getPhoneTopic);
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [groqKey, setGroqKey] = useState(getGroqKey);
  const [groqStatus, setGroqStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function testGroqKey() {
    setGroqStatus('testing…');
    const result = await testGroq();
    setGroqStatus(
      result.ok ? 'connected ✓' : `not connected — ${result.error}`,
    );
  }

  async function sendTestPing() {
    setPingStatus('sending…');
    const result = await sendParkPingSmart(
      phoneTopic,
      'Test from tasker — pings work',
      '',
    );
    if (result.ok) {
      setPingStatus('delivery confirmed ✓ — check your phone');
    } else {
      const status = result.status > 0 ? `HTTP ${result.status}` : 'no response';
      setPingStatus(
        `not confirmed (${status})${result.snippet ? ` — ${result.snippet}` : ''}`,
      );
    }
  }

  function addGoal() {
    if (newGoal.trim()) {
      dispatch({ type: 'addGoal', title: newGoal });
      setNewGoal('');
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        dispatch({ type: 'import', state: JSON.parse(text) });
      } catch {
        alert("That file doesn't look like a tasker backup.");
      }
    });
    e.target.value = '';
  }

  return (
    <main className="planning">
      <h2>Planning</h2>
      <p className="muted">
        The map — hidden while you execute. Hover a row for controls: <b>▶</b> starts
        that goal now, <b>+</b> adds a step inside, <b>⇥</b> nests it under the item
        above, <b>⇤</b> lifts it out (or turns a Backlog item into its own goal).
      </p>

      <div className="tree">
        {state.rootIds.length === 0 && (
          <p className="muted">No goals yet. Add one below.</p>
        )}
        {state.rootIds.map((id) => (
          <TreeNode
            key={id}
            id={id}
            depth={0}
            state={state}
            dispatch={dispatch}
            onStartGoal={onStartGoal}
            otherSpaceLabel={otherSpaceLabel}
            onMoveGoalToSpace={onMoveGoalToSpace}
          />
        ))}
      </div>

      <div className="row add-goal">
        <input
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addGoal()}
          placeholder="New goal…"
        />
        <button className="primary" onClick={addGoal}>
          Add goal
        </button>
      </div>

      <div className="backup-section">
        {backup.supported ? (
          backup.status === 'off' ? (
            <p className="muted small">
              Your data lives in this browser.{' '}
              <button className="link inline" onClick={backup.choose}>
                Choose a file on disk
              </button>{' '}
              and every change autosaves there too — safe from browser cleanups.
            </p>
          ) : backup.status === 'on' ? (
            <p className="muted small">
              <span className="backup-ok">●</span> Autosaving to{' '}
              <strong>{backup.fileName}</strong>
              <button className="link inline" onClick={backup.disconnect}>
                stop
              </button>
            </p>
          ) : (
            <p className="muted small">
              File backup paused (browser needs permission again).{' '}
              <button className="link inline" onClick={backup.reconnect}>
                Reconnect {backup.fileName ?? 'file'}
              </button>
            </p>
          )
        ) : (
          <p className="muted small">
            This browser can't autosave to a file — use Export below now and
            then, or open tasker in Chrome/Edge.
          </p>
        )}

        <div className="row backup">
          <button className="ghost" onClick={exportJson}>
            Export backup
          </button>
          <button className="ghost" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={importJson}
          />
        </div>
      </div>

      <SyncSettings
        syncState={syncState}
        spacesData={spacesData}
        onChanged={onSyncConfigChanged}
      />

      <div className="backup-section">
        <p className="muted small">
          Phone pings (optional): install the <strong>ntfy</strong> app on your
          phone, subscribe to a secret topic name you invent, and paste it
          here — parking will send your next step to your phone. Also accepts
          a full URL: a self-hosted ntfy server, or a{' '}
          <strong>Slack / Teams / Discord webhook</strong> for locked-down
          work networks.
        </p>
        <div className="row backup">
          <input
            value={phoneTopic}
            onChange={(e) => {
              setPhoneTopic(e.target.value);
              savePhoneTopic(e.target.value);
              setPingStatus(null);
            }}
            placeholder="e.g. tasker-thom-x7k2p9"
          />
          <button className="ghost" disabled={!phoneTopic.trim()} onClick={sendTestPing}>
            Send test
          </button>
          {window.taskerNative && (
            <button
              className="ghost"
              disabled={!phoneTopic.trim()}
              title="If your company network intercepts with a sign-in page (e.g. Zscaler), open it here and log in — the session then applies to pings"
              onClick={() => {
                try {
                  const origin = new URL(pingUrl(phoneTopic)).origin;
                  void window.taskerNative?.openAuth(origin);
                } catch {
                  // Malformed URL in the field — nothing to open.
                }
              }}
            >
              Network sign-in
            </button>
          )}
        </div>
        {pingStatus && <p className="muted small">{pingStatus}</p>}
      </div>

      <div className="backup-section">
        <p className="muted small">
          AI summary (optional): the Journal can tidy a day's finished tasks into
          standup-ready bullet points. It uses <strong>Groq</strong>, which is
          free — make a key at{' '}
          <button
            className="link inline"
            onClick={() => window.open('https://console.groq.com/keys', '_blank')}
          >
            console.groq.com/keys
          </button>{' '}
          and paste it here.
        </p>
        <div className="row backup">
          <input
            type="password"
            value={groqKey}
            onChange={(e) => {
              setGroqKey(e.target.value);
              saveGroqKey(e.target.value);
              setGroqStatus(null);
            }}
            placeholder="gsk_…"
          />
          <button className="ghost" disabled={!groqKey.trim()} onClick={testGroqKey}>
            Test
          </button>
        </div>
        {groqStatus && <p className="muted small">{groqStatus}</p>}
      </div>
    </main>
  );
}
