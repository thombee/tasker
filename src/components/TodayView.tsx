import { Dispatch, useState } from 'react';
import { Action } from '../model/store';
import { remainingSteps, todayActive } from '../model/traversal';
import { AppState } from '../model/types';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onDone: () => void;
}

// The morning ritual: pick 1–3 goals for today. Execution then walks only
// these; everything else rests (nothing is deleted or overdue). Optional —
// choosing nothing leaves every goal live.
export default function TodayView({ state, dispatch, onDone }: Props) {
  const active = todayActive(state);
  const [picked, setPicked] = useState<string[]>(
    active ? state.today!.goalIds : [],
  );

  // Only goals with work left are worth committing to; never the Backlog.
  const goals = state.rootIds.filter(
    (id) => id !== state.inboxId && remainingSteps(state, id) > 0,
  );

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function commit() {
    dispatch({ type: 'setToday', goalIds: picked });
    onDone();
  }

  function everything() {
    dispatch({ type: 'clearToday' });
    onDone();
  }

  return (
    <main className="today-view">
      <h2>Today's journey</h2>
      <p className="muted">
        Pick a few things to carry today. The rest will rest — nothing's lost,
        it just waits its turn.
      </p>

      {goals.length === 0 ? (
        <p className="muted">No goals with steps left. Add one in Plan.</p>
      ) : (
        <div className="today-goals">
          {goals.map((id) => {
            const goal = state.tasks[id];
            const on = picked.includes(id);
            const left = remainingSteps(state, id);
            return (
              <button
                key={id}
                className={`today-goal${on ? ' picked' : ''}`}
                onClick={() => toggle(id)}
              >
                <span className="today-check">{on ? '✓' : ''}</span>
                <span className="today-goal-title">{goal.title}</span>
                <span className="muted today-goal-left">
                  {left} step{left === 1 ? '' : 's'} left
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="today-actions">
        <button className="primary" disabled={picked.length === 0} onClick={commit}>
          {picked.length === 0
            ? 'Pick at least one'
            : `Start today (${picked.length})`}
        </button>
        <button className="ghost" onClick={everything}>
          {active ? 'Clear — focus on everything' : 'Skip — keep everything live'}
        </button>
      </div>
    </main>
  );
}
