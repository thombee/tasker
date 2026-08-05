import { useEffect, useState } from 'react';
import { getResetActivities } from '../model/checkins';
import { findCurrent } from '../model/traversal';
import { AppState } from '../model/types';

interface Props {
  open: boolean;
  state: AppState;
  onClose: () => void;
}

type Phase = 'menu' | 'resetting' | 'back';

function mmss(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function ResetOverlay({ open, state, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('menu');
  const [activity, setActivity] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const activities = getResetActivities();

  const currentId = findCurrent(state);
  const nextStep = currentId ? state.tasks[currentId].title : null;

  // Fresh start each time it opens.
  useEffect(() => {
    if (open) {
      setPhase('menu');
      setActivity(null);
      setSecondsLeft(0);
    }
  }, [open]);

  // Countdown while resetting.
  useEffect(() => {
    if (phase !== 'resetting' || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft]);

  useEffect(() => {
    if (phase === 'resetting' && secondsLeft === 0) setPhase('back');
  }, [phase, secondsLeft]);

  if (!open) return null;

  function startReset(minutes: number) {
    setSecondsLeft(minutes * 60);
    setPhase('resetting');
  }

  return (
    <div className="reset-overlay">
      <div className="reset-inner">
        {phase === 'menu' && (
          <>
            <p className="reset-mark">🌿</p>
            <h1>Reset.</h1>
            <p className="reset-permission">
              You're allowed to stop and centre yourself. A clear head <em>is</em>{' '}
              the work — the rest follows. No rush, no guilt.
            </p>

            <div className="reset-section">
              <p className="label">Take a real reset</p>
              <p className="muted small">Pick something that settles you:</p>
              <div className="reset-chips">
                {activities.map((a) => (
                  <button
                    key={a}
                    className={activity === a ? 'reset-chip on' : 'reset-chip'}
                    onClick={() => setActivity(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <p className="muted small">For how long? (a timer, so you don't have to watch the clock)</p>
              <div className="reset-times">
                {[5, 10, 15].map((m) => (
                  <button key={m} className="ghost" onClick={() => startReset(m)}>
                    {m} min
                  </button>
                ))}
              </div>
            </div>

            <div className="reset-section">
              <p className="label">Or ease back in</p>
              {nextStep ? (
                <p className="muted small">
                  When you're ready — just this one tiny thing:{' '}
                  <strong>{nextStep}</strong>
                </p>
              ) : (
                <p className="muted small">Nothing queued. Rest easy.</p>
              )}
              <button className="primary" onClick={onClose}>
                {nextStep ? 'Ease back in — just 2 minutes' : 'Back'}
              </button>
            </div>

            <button className="link reset-close" onClick={onClose}>
              not now
            </button>
          </>
        )}

        {phase === 'resetting' && (
          <>
            <p className="reset-mark">🫧</p>
            <p className="label">{activity ?? 'Centring'}</p>
            <p className="reset-count">{mmss(secondsLeft)}</p>
            <p className="reset-permission">
              This is time well spent. Let the rush go. Come back when you're
              ready — not before.
            </p>
            <button className="primary" onClick={() => setPhase('back')}>
              I'm centred
            </button>
          </>
        )}

        {phase === 'back' && (
          <>
            <p className="reset-mark">🌱</p>
            <h1>Welcome back.</h1>
            {nextStep ? (
              <>
                <p className="muted small">Nothing else — just this:</p>
                <p className="reset-next">{nextStep}</p>
                <button className="primary" onClick={onClose}>
                  Start — just 2 minutes
                </button>
              </>
            ) : (
              <button className="primary" onClick={onClose}>
                Back to it
              </button>
            )}
            <button className="link reset-close" onClick={() => setPhase('menu')}>
              a little more time
            </button>
          </>
        )}
      </div>
    </div>
  );
}
