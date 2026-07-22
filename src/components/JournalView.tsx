import { summarizeDays } from '../model/journal';
import { AppState } from '../model/types';

export default function JournalView({ state }: { state: AppState }) {
  const days = summarizeDays(state);

  return (
    <main className="journal">
      <h2>Journal</h2>
      <p className="muted">What you've done, day by day. Proof it adds up.</p>

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
          </h3>
          {day.finished.length > 0 && (
            <p className="journal-finished">
              finished: {day.finished.join(' · ')}
            </p>
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
