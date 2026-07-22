import { useEffect, useReducer, useState } from 'react';
import { emptyState, loadState, reducer, saveState } from './model/store';
import ExecutionView from './components/ExecutionView';
import PlanningView from './components/PlanningView';

type Mode = 'execute' | 'plan';

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState() ?? emptyState);
  const [mode, setMode] = useState<Mode>('execute');

  useEffect(() => {
    saveState(state);
  }, [state]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">tasker</span>
        <button
          className="link"
          onClick={() => setMode(mode === 'execute' ? 'plan' : 'execute')}
        >
          {mode === 'execute' ? 'Plan' : '← Back to focus'}
        </button>
      </header>
      {mode === 'execute' ? (
        <ExecutionView state={state} dispatch={dispatch} onOpenPlan={() => setMode('plan')} />
      ) : (
        <PlanningView state={state} dispatch={dispatch} />
      )}
    </div>
  );
}
