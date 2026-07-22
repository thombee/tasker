import { useEffect, useReducer, useState } from 'react';
import { emptyState, loadState, reducer, saveState } from './model/store';
import { findCurrent } from './model/traversal';
import { useFileBackup } from './hooks/useFileBackup';
import ExecutionView from './components/ExecutionView';
import JournalView from './components/JournalView';
import PlanningView from './components/PlanningView';

type Mode = 'execute' | 'plan' | 'journal';

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState() ?? emptyState);
  const [mode, setMode] = useState<Mode>('execute');
  const backup = useFileBackup(state);

  useEffect(() => {
    saveState(state);
  }, [state]);

  // The tab title carries the current task, so even a background tab is a
  // glanceable cue for what to do next.
  useEffect(() => {
    const currentId = findCurrent(state);
    document.title = currentId
      ? `☐ ${state.tasks[currentId].title} — tasker`
      : 'tasker';
  }, [state]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">tasker</span>
        <nav className="topnav">
          {mode !== 'execute' && (
            <button className="link" onClick={() => setMode('execute')}>
              ← Back to focus
            </button>
          )}
          {mode !== 'journal' && (
            <button className="link" onClick={() => setMode('journal')}>
              Journal
            </button>
          )}
          {mode !== 'plan' && (
            <button className="link" onClick={() => setMode('plan')}>
              Plan
            </button>
          )}
        </nav>
      </header>
      {mode === 'execute' && (
        <ExecutionView
          state={state}
          dispatch={dispatch}
          onOpenPlan={() => setMode('plan')}
          backupPaused={backup.status === 'paused'}
        />
      )}
      {mode === 'plan' && <PlanningView state={state} dispatch={dispatch} backup={backup} />}
      {mode === 'journal' && <JournalView state={state} />}
    </div>
  );
}
