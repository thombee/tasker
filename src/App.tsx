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

  const nav: { id: Mode; label: string }[] = [
    { id: 'execute', label: 'Focus' },
    { id: 'today', label: 'Today' },
    { id: 'journal', label: 'Journal' },
    { id: 'plan', label: 'Plan' },
  ];

  function startGoal(id: string) {
    dispatch({ type: 'startGoal', id });
    setMode('execute');
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          tasker <span className="version">v{__APP_VERSION__}</span>
        </span>
        <nav className="topnav">
          {nav.map((item) => (
            <button
              key={item.id}
              className={mode === item.id ? 'navlink active' : 'navlink'}
              aria-current={mode === item.id ? 'page' : undefined}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Keyed wrapper so each section fades in — softer than a hard cut. */}
      <div className="mode-content" key={mode}>
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
        {mode === 'plan' && (
          <PlanningView
            state={state}
            dispatch={dispatch}
            backup={backup}
            onStartGoal={startGoal}
          />
        )}
        {mode === 'journal' && (
          <JournalView state={state} onOpenPlan={() => setMode('plan')} />
        )}
      </div>
    </div>
  );
}
