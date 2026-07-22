import { Dispatch, useEffect, useRef, useState } from 'react';
import { Action } from '../model/store';
import { findCurrent, goalOf } from '../model/traversal';
import { AppState } from '../model/types';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onOpenPlan: () => void;
}

export default function ExecutionView({ state, dispatch, onOpenPlan }: Props) {
  const currentId = findCurrent(state);
  const [breakingDown, setBreakingDown] = useState(false);
  const [steps, setSteps] = useState('');

  // Close the break-down panel whenever the current task changes.
  useEffect(() => {
    setBreakingDown(false);
    setSteps('');
  }, [currentId]);

  const current = currentId ? state.tasks[currentId] : null;
  const goal = currentId ? goalOf(state, currentId) : null;
  const canUndo = state.history.length > 0;

  const lastEntry = state.history[state.history.length - 1];
  const justFinished =
    lastEntry && lastEntry.kind === 'done'
      ? state.tasks[lastEntry.changes[0].id]?.title
      : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (breakingDown) {
        if (e.key === 'Escape') setBreakingDown(false);
        return;
      }
      if (!current) return;
      if (e.key === 'd' || e.key === 'Enter') dispatch({ type: 'done', id: current.id });
      else if (e.key === 'b') setBreakingDown(true);
      else if (e.key === 's') dispatch({ type: 'skip', id: current.id });
      else if (e.key === 'z' && canUndo) dispatch({ type: 'undo' });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, breakingDown, canUndo, dispatch]);

  if (state.rootIds.length === 0) {
    return <FirstGoal dispatch={dispatch} />;
  }

  if (!current) {
    return (
      <main className="execution">
        <div className="all-done">
          <p className="all-done-mark">✓</p>
          <h1>That's everything.</h1>
          <p className="muted">Nothing left to do. Enjoy the quiet.</p>
          <button className="ghost" onClick={onOpenPlan}>
            Plan what's next
          </button>
        </div>
      </main>
    );
  }

  // A parent surfaces only when every child is done or skipped but at least
  // one was skipped — the user decides whether it's really finished.
  const isSurfacedParent = current.childIds.length > 0;
  const skippedInside = current.childIds.filter(
    (c) => state.tasks[c].status === 'skipped',
  ).length;

  function submitSteps() {
    const titles = steps.split('\n');
    if (titles.some((t) => t.trim()) && current) {
      dispatch({ type: 'breakDown', id: current.id, titles });
    }
    setBreakingDown(false);
    setSteps('');
  }

  return (
    <main className="execution">
      <div className="current-card" key={current.id}>
        <p className="label">Current</p>
        <h1 className="task-title">{current.title}</h1>
        {current.estimateMinutes && (
          <p className="muted small">about {current.estimateMinutes} min</p>
        )}
        {current.notes && <p className="notes">{current.notes}</p>}
        {isSurfacedParent && (
          <p className="muted small">
            Every step inside is handled
            {skippedInside > 0 && ` (${skippedInside} skipped)`} — is this finished?
          </p>
        )}
      </div>

      {breakingDown ? (
        <div className="breakdown">
          <p className="muted small">
            What's the very first physical action? One tiny step per line.
          </p>
          <textarea
            autoFocus
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitSteps();
              if (e.key === 'Escape') setBreakingDown(false);
            }}
            placeholder={'Open the file\nRead the first function\nRename one variable'}
            rows={5}
          />
          <div className="row">
            <button className="primary" onClick={submitSteps}>
              Break it down
            </button>
            <button className="ghost" onClick={() => setBreakingDown(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="controls">
          <button className="ghost" disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })}>
            ← Previous
          </button>
          <button className="primary" onClick={() => dispatch({ type: 'done', id: current.id })}>
            Done
          </button>
          <button className="secondary" onClick={() => setBreakingDown(true)}>
            Too Big
          </button>
          <button className="ghost" onClick={() => dispatch({ type: 'skip', id: current.id })}>
            Skip
          </button>
        </div>
      )}

      {justFinished && !breakingDown && (
        <p className="just-finished">just finished: {justFinished}</p>
      )}

      <footer className="goal-line">
        {goal && goal.id !== current.id && (
          <p>
            <span className="muted">Goal</span> {goal.title}
          </p>
        )}
        <p className="keys muted">d done · b too big · s skip · z previous</p>
      </footer>
    </main>
  );
}

function FirstGoal({ dispatch }: { dispatch: Dispatch<Action> }) {
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (title.trim()) {
      dispatch({ type: 'addGoal', title });
      setTitle('');
    } else {
      inputRef.current?.focus();
    }
  }

  return (
    <main className="execution">
      <div className="first-goal">
        <h1>What are you working toward?</h1>
        <p className="muted">
          Add one goal. Don't worry about its size — you'll break it into tiny
          steps as you go.
        </p>
        <div className="row">
          <input
            ref={inputRef}
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. BigW Ticket"
          />
          <button className="primary" onClick={submit}>
            Start
          </button>
        </div>
      </div>
    </main>
  );
}
