import { ChangeEvent, Dispatch, useRef, useState } from 'react';
import { FileBackup } from '../hooks/useFileBackup';
import { Action } from '../model/store';
import { AppState } from '../model/types';
import TreeNode from './TreeNode';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  backup: FileBackup;
}

export default function PlanningView({ state, dispatch, backup }: Props) {
  const [newGoal, setNewGoal] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

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
        The map. You won't see any of this while executing — only the next step.
      </p>

      <div className="tree">
        {state.rootIds.length === 0 && (
          <p className="muted">No goals yet. Add one below.</p>
        )}
        {state.rootIds.map((id) => (
          <TreeNode key={id} id={id} depth={0} state={state} dispatch={dispatch} />
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
    </main>
  );
}
