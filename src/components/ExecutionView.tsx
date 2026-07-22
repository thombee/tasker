import { Dispatch, useEffect, useRef, useState } from 'react';
import { completedToday, lastActiveDay } from '../model/journal';
import { Action } from '../model/store';
import { findCurrent, goalOf, remainingSteps } from '../model/traversal';
import { AppState } from '../model/types';
import { quoteOfTheDay } from '../quotes';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onOpenPlan: () => void;
  backupPaused: boolean;
}

export default function ExecutionView({ state, dispatch, onOpenPlan, backupPaused }: Props) {
  const currentId = findCurrent(state);
  const [breakingDown, setBreakingDown] = useState(false);
  const [steps, setSteps] = useState('');
  const [scratchOpen, setScratchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureText, setCaptureText] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [recapDismissed, setRecapDismissed] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [donePulse, setDonePulse] = useState(0);
  const prevHistoryLength = useRef(state.history.length);

  // A brief ✓ pulse when something was just completed — immediate,
  // calm acknowledgment, not a celebration.
  useEffect(() => {
    const prev = prevHistoryLength.current;
    prevHistoryLength.current = state.history.length;
    if (
      state.history.length > prev &&
      state.history[state.history.length - 1]?.kind === 'done'
    ) {
      setDonePulse((n) => n + 1);
    }
  }, [state.history.length, state.history]);

  // Close the break-down panel whenever the current task changes.
  useEffect(() => {
    setBreakingDown(false);
    setSteps('');
    setEditingTitle(false);
  }, [currentId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const current = currentId ? state.tasks[currentId] : null;
  const goal = currentId ? goalOf(state, currentId) : null;
  const canUndo = state.history.length > 0;
  const quote = quoteOfTheDay();

  // Fresh sitting: nothing finished yet today, so show what the last
  // working day produced — momentum you can reread instead of reconstruct.
  const recap =
    !recapDismissed && !completedToday(state) ? lastActiveDay(state) : null;

  // Recently finished steps (oldest first) — re-reading your own momentum
  // makes re-entry after a break much easier.
  const trail: string[] = [];
  for (let i = state.history.length - 1; i >= 0 && trail.length < 3; i--) {
    const entry = state.history[i];
    if (entry.kind !== 'done') continue;
    const task = state.tasks[entry.changes[0].id];
    if (task) trail.push(task.title);
  }
  trail.reverse();

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
      else if (e.key === 'n') setScratchOpen((open) => !open);
      else if (e.key === 'c') {
        e.preventDefault();
        setCaptureOpen(true);
      }
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

  const parent = current.parentId ? state.tasks[current.parentId] : null;

  // Goal-gradient nudge: say so when this is the last remaining step of a
  // stretch or of the whole goal — narrative, never a number.
  const lastOfGoal =
    goal !== null && goal.id !== current.id && remainingSteps(state, goal.id) === 1;
  const lastOfStretch =
    !lastOfGoal &&
    parent !== null &&
    goal !== null &&
    parent.id !== goal.id &&
    remainingSteps(state, parent.id) === 1;

  // A parent surfaces when every child is done or skipped — the user decides
  // whether it's really finished (Done) or just under-planned (Too Big).
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

  function submitCapture() {
    if (captureText.trim()) {
      dispatch({ type: 'capture', title: captureText });
      setToast('Saved to Inbox — keep going');
    }
    setCaptureText('');
    setCaptureOpen(false);
  }

  return (
    <main className="execution">
      {donePulse > 0 && (
        <div className="done-pulse" key={donePulse} aria-hidden="true">
          ✓
        </div>
      )}
      <div className="current-card" key={current.id}>
        <p className="label">Current</p>
        {editingTitle ? (
          <input
            autoFocus
            className="task-title-edit"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              dispatch({ type: 'rename', id: current.id, title: titleDraft });
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                dispatch({ type: 'rename', id: current.id, title: titleDraft });
                setEditingTitle(false);
              }
              if (e.key === 'Escape') setEditingTitle(false);
            }}
          />
        ) : (
          <h1
            className="task-title editable"
            title="Click to reword"
            onClick={() => {
              setTitleDraft(current.title);
              setEditingTitle(true);
            }}
          >
            {current.title}
          </h1>
        )}
        {parent && goal && parent.id !== goal.id && (
          <p className="muted small">part of: {parent.title}</p>
        )}
        {lastOfGoal && <p className="last-one">last step of this goal</p>}
        {lastOfStretch && <p className="last-one">last one in this stretch</p>}
        {current.estimateMinutes && (
          <p className="muted small">about {current.estimateMinutes} min</p>
        )}
        {current.notes && !(scratchOpen && goal && current.id === goal.id) && (
          <p className="notes">{current.notes}</p>
        )}
        {isSurfacedParent && (
          <p className="muted small">
            Every step inside is handled
            {skippedInside > 0 && ` (${skippedInside} skipped)`} — done, or is
            there more?
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

      {toast && <p className="just-finished">{toast}</p>}

      {recap && !breakingDown && (
        <div className="recap">
          <p className="recap-head">
            {recap.label === 'Yesterday' ? 'Yesterday' : `Last time (${recap.label})`} you
            did:
            <button className="recap-dismiss" onClick={() => setRecapDismissed(true)}>
              ×
            </button>
          </p>
          {recap.steps.slice(0, 6).map((step) => (
            <p key={step.id} className="trail-step">
              ✓ {step.title}
            </p>
          ))}
          {recap.steps.length > 6 && (
            <p className="trail-step">…and {recap.steps.length - 6} more</p>
          )}
        </div>
      )}

      {trail.length > 0 && !breakingDown && !recap && (
        <div className="trail">
          {trail.map((title, i) => (
            <p key={i} className="trail-step">
              ✓ {title}
            </p>
          ))}
        </div>
      )}

      {captureOpen && (
        <div className="capture">
          <input
            autoFocus
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            onBlur={() => setCaptureOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCapture();
              if (e.key === 'Escape') setCaptureOpen(false);
            }}
            placeholder="Stray thought — it goes to your Inbox, you stay here…"
          />
        </div>
      )}

      {scratchOpen && goal && (
        <div className="scratchpad">
          <p className="label">Notes — {goal.title}</p>
          <textarea
            value={goal.notes}
            onChange={(e) => dispatch({ type: 'setNotes', id: goal.id, notes: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setScratchOpen(false);
            }}
            rows={5}
            placeholder={
              'Working memory for this goal — where things are, decisions made, where you left off…'
            }
          />
        </div>
      )}

      <footer className="goal-line">
        {goal && goal.id !== current.id && (
          <p>
            <span className="muted">Goal</span> {goal.title}
          </p>
        )}
        <div className="footer-actions">
          <button className="link" onClick={() => setScratchOpen((open) => !open)}>
            {goal?.notes ? 'notes •' : 'notes'}
          </button>
          <button className="link" onClick={() => setCaptureOpen(true)}>
            + capture
          </button>
        </div>
        <p className="quote">
          “{quote.text}”{quote.author && <span className="muted"> — {quote.author}</span>}
        </p>
        <p className="keys muted">
          d done · b too big · s skip · z previous · n notes · c capture
        </p>
        {backupPaused && (
          <p className="keys muted">file backup paused — open Plan to reconnect</p>
        )}
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
