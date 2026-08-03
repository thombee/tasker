import { Dispatch, useState } from 'react';
import { SpaceId, TopAction } from '../model/store';
import { Gripe } from '../model/types';

interface Props {
  gripes: Gripe[];
  dispatch: Dispatch<TopAction>;
  spaceLabel: Record<SpaceId, string>;
}

function ago(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export default function GripesView({ gripes, dispatch, spaceLabel }: Props) {
  const [text, setText] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const open = gripes.filter((g) => g.resolvedAt === null);
  const resolved = gripes
    .filter((g) => g.resolvedAt !== null)
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));

  function add() {
    if (text.trim()) {
      dispatch({ type: 'addGripe', text });
      setText('');
    }
  }

  return (
    <main className="gripes">
      <h2>Gripes</h2>
      <p className="muted">
        Everyday friction — the small annoyances worth naming so they stop
        rattling around. Dump them here (or from your phone). Later, turn one
        into a goal to actually fix, or let it go on purpose. Nothing rots
        silently.
      </p>

      <div className="row add-goal">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="What's bugging you?"
        />
        <button className="primary" onClick={add}>
          Log it
        </button>
      </div>

      {open.length === 0 ? (
        <p className="muted small">Nothing open. A clear head — or a quiet day.</p>
      ) : (
        <ul className="gripe-list">
          {open.map((g) => (
            <li key={g.id} className="gripe">
              <div className="gripe-text">{g.text}</div>
              <div className="gripe-meta muted small">{ago(g.createdAt)}</div>
              <div className="gripe-actions">
                <span className="muted small">solve in</span>
                {(['life', 'work'] as SpaceId[]).map((s) => (
                  <button
                    key={s}
                    className="ghost small"
                    title={`Make a goal in ${spaceLabel[s]} to fix this`}
                    onClick={() => dispatch({ type: 'promoteGripe', id: g.id, space: s })}
                  >
                    {spaceLabel[s]}
                  </button>
                ))}
                <button
                  className="link inline"
                  title="Deliberately drop it — not everything needs fixing"
                  onClick={() => dispatch({ type: 'letGoGripe', id: g.id })}
                >
                  let it go
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <div className="gripe-resolved">
          <button className="link" onClick={() => setShowResolved((s) => !s)}>
            {showResolved ? 'hide' : 'show'} resolved ({resolved.length})
          </button>
          {showResolved && (
            <>
              <ul className="gripe-list">
                {resolved.map((g) => (
                  <li key={g.id} className="gripe is-resolved">
                    <div className="gripe-text">{g.text}</div>
                    <div className="gripe-meta muted small">
                      {g.resolution === 'promoted' ? '→ made a goal' : 'let go'} ·{' '}
                      {ago(g.resolvedAt ?? 0)}
                    </div>
                  </li>
                ))}
              </ul>
              <button
                className="ghost small"
                onClick={() => dispatch({ type: 'clearResolvedGripes' })}
              >
                Clear resolved
              </button>
            </>
          )}
        </div>
      )}
    </main>
  );
}
