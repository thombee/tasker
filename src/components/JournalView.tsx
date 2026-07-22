import { useState } from 'react';
import { daySummaryText, DayGroup, heatLevel, heatmap, summarizeDays } from '../model/journal';
import { AppState } from '../model/types';

export default function JournalView({ state }: { state: AppState }) {
  const days = summarizeDays(state);
  const grid = heatmap(state);
  const [copied, setCopied] = useState<string | null>(null);

  function copyDay(day: DayGroup) {
    const text = daySummaryText(day);
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(day.key);
        setTimeout(() => setCopied((k) => (k === day.key ? null : k)), 2000);
      },
      () => setCopied(null),
    );
  }

  const totalDaysActive = grid.flat().filter((c) => c.count > 0).length;

  return (
    <main className="journal">
      <h2>Journal</h2>
      <p className="muted">What you've done, day by day. Proof it adds up.</p>

      {totalDaysActive > 0 && (
        <div className="heatmap">
          <div className="heatmap-grid">
            {grid.map((week, wi) => (
              <div key={wi} className="heatmap-week">
                {week.map((cell) => (
                  <div
                    key={cell.key}
                    className={`heatmap-cell level-${cell.future ? 'future' : heatLevel(cell.count)}`}
                    title={
                      cell.future
                        ? ''
                        : `${cell.key}: ${cell.count} step${cell.count === 1 ? '' : 's'}`
                    }
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="heatmap-caption muted">
            {totalDaysActive} active day{totalDaysActive === 1 ? '' : 's'} in the last
            12 weeks
          </p>
        </div>
      )}

      {days.length === 0 && (
        <p className="muted">
          Nothing here yet — it fills up as you finish steps. Even tiny ones.
        </p>
      )}

      {days.map((day) => (
        <section key={day.key} className="journal-day">
          <h3>
            {day.label}
            <span className="muted journal-count">
              {day.steps.length} step{day.steps.length === 1 ? '' : 's'}
            </span>
            <button
              className="link journal-copy"
              title="Copy a plain-text recap — paste into a standup or 1:1"
              onClick={() => copyDay(day)}
            >
              {copied === day.key ? 'copied ✓' : 'copy'}
            </button>
          </h3>
          {day.finished.length > 0 && (
            <p className="journal-finished">finished: {day.finished.join(' · ')}</p>
          )}
          <ul>
            {day.steps.map((step) => (
              <li key={step.id}>
                <span className="journal-check">✓</span> {step.title}
                <span className="muted journal-goal"> — {step.goalTitle}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
