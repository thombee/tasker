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
  const [showKeys, setShowKeys] = useState(false);
  const [parkOpen, setParkOpen] = useState(false);
  const [parkNote, setParkNote] = useState('');
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

  // Close per-task panels whenever the current task changes.
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
      if (state.parked) {
        if (e.key === 'Enter' || e.key === 'r') dispatch({ type: 'resume' });
        return;
      }
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
      else if (e.key === 'g') dispatch({ type: 'nextGoal' });
      else if (e.key === '?') setShowKeys((show) => !show);
      else if (e.key === 'c') {
        e.preventDefault();
        setCaptureOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, breakingDown, canUndo, dispatch, state.parked]);

  if (state.rootIds.length === 0) {
    return <FirstGoal dispatch={dispatch} />;
  }

  if (!current) {
    return (
      <main className="execution">
        <div className="stage">
          <div className="all-done">
            <p className="all-done-mark">✓</p>
            <h1>That's everything.</h1>
            <p className="muted">Nothing left to do. Enjoy the quiet.</p>
            <button className="ghost" onClick={onOpenPlan}>
              Plan what's next
            </button>
          </div>
        </div>
      </main>
    );
  }

  const parent = current.parentId ? state.tasks[current.parentId] : null;

  // "Switch goal" only makes sense when another goal still has work left.
  const canSwitchGoal =
    state.rootIds.filter((id) => remainingSteps(state, id) > 0).length > 1;

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
  // whether it's really finished (Finished) or under-planned (More steps).
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

  function submitCapture(destination: 'inbox' | 'goal') {
    if (captureText.trim()) {
      if (destination === 'goal' && goal) {
        // A tangent that belongs to the goal you're inside becomes one of
        // its upcoming steps — no trip to Planning mode.
        dispatch({ type: 'addChild', parentId: goal.id, title: captureText });
        setToast(`Added as a step in: ${goal.title}`);
      } else {
        dispatch({ type: 'capture', title: captureText });
        setToast('Saved to Inbox — keep going');
      }
    }
    setCaptureText('');
    setCaptureOpen(false);
  }

  // While parked, the whole screen rests on the next step — nothing else.
  // The exit-memory (and the return-memory) is the microtask, not the goal.
  if (state.parked) {
    return (
      <main className="execution">
        <div className="stage">
          <div className="current-card parked-card">
            <p className="parked-mark">☾</p>
            <p className="label">Parked</p>
            <p className="muted small">When you come back, it's just:</p>
            <h1 className="task-title">{current.title}</h1>
            {state.parked.note && <p className="notes">“{state.parked.note}”</p>}
            <p className="muted small parked-reassure">
              It's written down. You don't have to carry it.
            </p>
            <div className="controls">
              <button className="primary" onClick={() => dispatch({ type: 'resume' })}>
                I'm back
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="execution">
      {donePulse > 0 && (
        <div className="done-pulse" key={donePulse} aria-hidden="true">
          ✓
        </div>
      )}

      <div className="stage">
        {recap && (
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

        <div className="current-card" key={current.id}>
          <p className={isSurfacedParent ? 'label label-wrap' : 'label'}>
            {isSurfacedParent ? 'Wrapping up' : 'Current'}
          </p>
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

          <div className="task-meta">
            {parent && goal && parent.id !== goal.id && (
              <p className="muted small">part of: {parent.title}</p>
            )}
            {current.estimateMinutes && (
              <p className="muted small">about {current.estimateMinutes} min</p>
            )}
            {current.notes && !(scratchOpen && goal && current.id === goal.id) && (
              <p className="notes">{current.notes}</p>
            )}
            {isSurfacedParent && (
              <p className="muted small">
                Every step inside is handled
                {skippedInside > 0 && ` (${skippedInside} skipped)`}.
              </p>
            )}
            {lastOfGoal && <p className="last-one">last step of this goal</p>}
            {lastOfStretch && <p className="last-one">last one in this stretch</p>}
          </div>

          {breakingDown ? (
            <div className="breakdown">
              <p className="muted small">
                {isSurfacedParent
                  ? "What's still left? One step per line."
                  : "What's the very first physical action? One tiny step per line."}
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
              <button
                className="ghost"
                disabled={!canUndo}
                onClick={() => dispatch({ type: 'undo' })}
              >
                ← Previous
              </button>
              <button
                className="primary"
                onClick={() => dispatch({ type: 'done', id: current.id })}
              >
                {isSurfacedParent ? '✓ Finished' : 'Done'}
              </button>
              <button className="secondary" onClick={() => setBreakingDown(true)}>
                {isSurfacedParent ? '+ More steps' : 'Too Big'}
              </button>
              <button
                className="ghost"
                onClick={() => dispatch({ type: 'skip', id: current.id })}
              >
                Skip
              </button>
            </div>
          )}
        </div>

        <div className="feedback">
          {toast && <p className="just-finished">{toast}</p>}
          {!toast && trail.length > 0 && !recap && (
            <div className="trail">
              {trail.map((title, i) => (
                <p key={i} className="trail-step">
                  ✓ {title}
                </p>
              ))}
            </div>
          )}
        </div>

        {parkOpen && (
          <div className="capture">
            <p className="muted small">
              Stepping away? Your next step is safe: <strong>{current.title}</strong>
            </p>
            <input
              autoFocus
              value={parkNote}
              onChange={(e) => setParkNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  dispatch({ type: 'park', note: parkNote });
                  setParkNote('');
                  setParkOpen(false);
                }
                if (e.key === 'Escape') setParkOpen(false);
              }}
              placeholder="Breadcrumb for future you (optional)…"
            />
            <div className="row">
              <button
                className="primary"
                onClick={() => {
                  dispatch({ type: 'park', note: parkNote });
                  setParkNote('');
                  setParkOpen(false);
                }}
              >
                Park it
              </button>
              <button className="ghost" onClick={() => setParkOpen(false)}>
                Cancel
              </button>
            </div>
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
                if (e.key === 'Enter') submitCapture(e.shiftKey ? 'goal' : 'inbox');
                if (e.key === 'Escape') setCaptureOpen(false);
              }}
              placeholder="Stray thought — capture it, stay here…"
            />
            <p className="keys muted">↵ to Inbox · shift-↵ step in this goal</p>
          </div>
        )}

        {scratchOpen && goal && (
          <div className="scratchpad">
            <p className="label">Notes — {goal.title}</p>
            <textarea
              value={goal.notes}
              onChange={(e) =>
                dispatch({ type: 'setNotes', id: goal.id, notes: e.target.value })
              }
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
      </div>

      <footer className="goal-line">
        <div className="footer-main">
          {goal && goal.id !== current.id ? (
            <p className="footer-goal">
              <span className="muted">Goal</span> {goal.title}
            </p>
          ) : (
            <span />
          )}
          <div className="footer-actions">
            <button className="link" onClick={() => setScratchOpen((open) => !open)}>
              {goal?.notes ? 'notes •' : 'notes'}
            </button>
            <button className="link" onClick={() => setCaptureOpen(true)}>
              + capture
            </button>
            {canSwitchGoal && (
              <button
                className="link"
                title="Move on to the next goal — nothing gets skipped"
                onClick={() => dispatch({ type: 'nextGoal' })}
              >
                switch goal →
              </button>
            )}
            <button
              className="link"
              title="Stepping away? Park with a breadcrumb for future you"
              onClick={() => setParkOpen(true)}
            >
              park ☾
            </button>
            <button
              className="link"
              title="Keyboard shortcuts"
              onClick={() => setShowKeys((show) => !show)}
            >
              ?
            </button>
          </div>
        </div>
        <p className="quote">
          “{quote.text}”{quote.author && <span className="quote-author"> — {quote.author}</span>}
        </p>
        {showKeys && (
          <p className="keys muted">
            d done · b break down · s skip · z previous · n notes · c capture · g
            switch goal
          </p>
        )}
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
      <div className="stage">
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
      </div>
    </main>
  );
}
