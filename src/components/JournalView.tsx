import { useState } from 'react';
import { getGroqKey, summarizeDay } from '../model/aiSummary';
import { daySummaryText, DayGroup, heatLevel, heatmap, summarizeDays } from '../model/journal';
import { AppState } from '../model/types';

interface Props {
  state: AppState;
  onOpenPlan: () => void;
}

export default function JournalView({ state, onOpenPlan }: Props) {
  const days = summarizeDays(state);
  const grid = heatmap(state);
  const [copied, setCopied] = useState<string | null>(null);
  const [aiDay, setAiDay] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiError, setAiError] = useState('');

  function copyText(text: string, tag: string) {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(tag);
        setTimeout(() => setCopied((k) => (k === tag ? null : k)), 2000);
      },
      () => setCopied(null),
    );
  }

  async function summarize(day: DayGroup) {
    if (!getGroqKey()) {
      setAiDay(day.key);
      setAiText('');
      setAiError('needs-key');
      return;
    }
    setAiDay(day.key);
    setAiText('');
    setAiError('');
    setAiBusy(true);
    const result = await summarizeDay(daySummaryText(day));
    setAiBusy(false);
    if (result.ok) setAiText(result.text);
    else setAiError(result.error || 'Something went wrong');
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
            <span className="journal-day-actions">
              <button
                className="link"
                title="AI-tidy this day into standup bullets (Groq)"
                onClick={() => summarize(day)}
              >
                ✨ summarize
              </button>
              <button
                className="link"
                title="Copy a plain-text recap — paste into a standup or 1:1"
                onClick={() => copyText(daySummaryText(day), `plain-${day.key}`)}
              >
                {copied === `plain-${day.key}` ? 'copied ✓' : 'copy'}
              </button>
            </span>
          </h3>

          {aiDay === day.key && (
            <div className="ai-summary">
              {aiBusy && <p className="muted small">summarizing…</p>}
              {!aiBusy && aiError === 'needs-key' && (
                <p className="muted small">
                  Add a free Groq key first —{' '}
                  <button className="link inline" onClick={onOpenPlan}>
                    open Plan
                  </button>
                </p>
              )}
              {!aiBusy && aiError && aiError !== 'needs-key' && (
                <p className="muted small">couldn't summarize — {aiError}</p>
              )}
              {!aiBusy && aiText && (
                <>
                  <pre className="ai-text">{aiText}</pre>
                  <button
                    className="link"
                    onClick={() => copyText(aiText, `ai-${day.key}`)}
                  >
                    {copied === `ai-${day.key}` ? 'copied ✓' : 'copy summary'}
                  </button>
                </>
              )}
            </div>
          )}

          {day.finished.length > 0 && (
            <p className="journal-finished">finished: {day.finished.join(' · ')}</p>
          )}
          <ul>
            {day.steps.map((step) => (
              <li key={step.id}>
                <span className="journal-check">✓</span> {step.title}
                <span className="muted journal-goal"> — {step.goalTitle}</span>
                {step.answer && <p className="journal-answer">{step.answer}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
