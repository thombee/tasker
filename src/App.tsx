import { useEffect, useReducer, useState } from 'react';
import { loadSpaces, saveSpaces, SpaceId, topReducer } from './model/store';
import { findCurrent } from './model/traversal';
import { useFileBackup } from './hooks/useFileBackup';
import { useGistSync } from './hooks/useGistSync';
import ExecutionView from './components/ExecutionView';
import JournalView from './components/JournalView';
import PlanningView from './components/PlanningView';
import TodayView from './components/TodayView';

type Mode = 'execute' | 'plan' | 'journal' | 'today';

const SPACE_LABEL: Record<SpaceId, string> = { work: 'Work', life: 'Life' };

export default function App() {
  const [spaces, dispatch] = useReducer(topReducer, undefined, loadSpaces);
  const state = spaces[spaces.active];
  const [mode, setMode] = useState<Mode>('execute');
  const [pendingCapture, setPendingCapture] = useState(false);
  const [syncConfigVersion, setSyncConfigVersion] = useState(0);
  const backup = useFileBackup(state);
  const syncState = useGistSync(spaces, dispatch, syncConfigVersion);

  useEffect(() => {
    saveSpaces(spaces);
  }, [spaces]);

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

  const otherSpace: SpaceId = spaces.active === 'work' ? 'life' : 'work';

  const syncTitle =
    syncState.phase === 'synced'
      ? `Synced across devices${syncState.lastSyncedAt ? ` at ${new Date(syncState.lastSyncedAt).toLocaleTimeString()}` : ''}`
      : syncState.phase === 'saving'
        ? 'Saving to the cloud…'
        : syncState.phase === 'connecting'
          ? 'Connecting to sync…'
          : syncState.phase === 'error'
            ? `Sync problem — ${syncState.error} (open Plan to fix)`
            : '';

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand">
            tasker <span className="version">v{__APP_VERSION__}</span>
          </span>
          <div className="space-toggle" role="group" aria-label="Work or Life">
            {(['work', 'life'] as SpaceId[]).map((s) => (
              <button
                key={s}
                className={spaces.active === s ? 'space active' : 'space'}
                onClick={() => dispatch({ type: 'switchSpace', space: s })}
              >
                {SPACE_LABEL[s]}
              </button>
            ))}
          </div>
          {syncState.phase !== 'off' && (
            <button
              className={`sync-dot sync-${syncState.phase}`}
              title={syncTitle}
              onClick={() => setMode('plan')}
              aria-label={syncTitle}
            >
              {syncState.phase === 'error' ? '⚠' : syncState.phase === 'synced' ? '⟳' : '…'}
            </button>
          )}
        </div>
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
            otherSpaceLabel={SPACE_LABEL[otherSpace]}
            onMoveGoalToSpace={(id) => dispatch({ type: 'moveGoalToSpace', id, to: otherSpace })}
            syncState={syncState}
            spacesData={{ work: spaces.work, life: spaces.life }}
            onSyncConfigChanged={() => setSyncConfigVersion((v) => v + 1)}
          />
        )}
        {mode === 'journal' && (
          <JournalView state={state} onOpenPlan={() => setMode('plan')} />
        )}
      </div>
    </div>
  );
}
