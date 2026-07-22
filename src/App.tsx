import { useEffect, useReducer, useState } from 'react';
import { emptyState, loadState, reducer, saveState } from './model/store';
import { findCurrent } from './model/traversal';
import { useFileBackup } from './hooks/useFileBackup';
import ExecutionView from './components/ExecutionView';
import JournalView from './components/JournalView';
import PlanningView from './components/PlanningView';
import TodayView from './components/TodayView';

type Mode = 'execute' | 'plan' | 'journal' | 'today';

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState() ?? emptyState);
  const [mode, setMode] = useState<Mode>('execute');
  const [pendingCapture, setPendingCapture] = useState(false);
  const backup = useFileBackup(state);

  useEffect(() => {
    saveState(state);
  }, [state]);

  // Global capture hotkey (desktop app): jump to focus mode and flag a
  // pending capture. A flag (not an event) survives ExecutionView remounting
  // when the mode switches.
  useEffect(() => {
    if (!window.taskerNative?.onQuickCapture) return;
    return window.taskerNative.onQuickCapture(() => {
      setMode('execute');
      setPendingCapture(true);
    });
  }, []);

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
        <span className="brand">tasker <span className="version">v{__APP_VERSION__}</span></span>
        <nav className="topnav">
          {mode !== 'execute' && (
            <button className="link" onClick={() => setMode('execute')}>
              ← Focus
            </button>
          )}
          {mode !== 'today' && (
            <button className="link" onClick={() => setMode('today')}>
              Today
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
          onOpenToday={() => setMode('today')}
          backupPaused={backup.status === 'paused'}
          pendingCapture={pendingCapture}
          onCaptureConsumed={() => setPendingCapture(false)}
        />
      )}
      {mode === 'today' && (
        <TodayView state={state} dispatch={dispatch} onDone={() => setMode('execute')} />
      )}
      {mode === 'plan' && <PlanningView state={state} dispatch={dispatch} backup={backup} />}
      {mode === 'journal' && <JournalView state={state} />}
    </div>
  );
}
