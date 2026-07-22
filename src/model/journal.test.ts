import { describe, expect, it } from 'vitest';
import { completedToday, lastActiveDay, summarizeDays } from './journal';
import { emptyState, reducer } from './store';
import { AppState } from './types';

const NOW = new Date(2026, 6, 22, 9, 0, 0).getTime(); // local Wed 22 Jul, 9am
const DAY = 86400000;

// Build a journey and backdate completions to specific days.
function buildState(): AppState {
  let state = reducer(emptyState, { type: 'addGoal', title: 'BigW Ticket' });
  const goalId = state.rootIds[0];
  state = reducer(state, {
    type: 'breakDown',
    id: goalId,
    titles: ['Open file', 'Add parameter', 'Run tests'],
  });
  return state;
}

function completeAt(state: AppState, title: string, at: number): AppState {
  const task = Object.values(state.tasks).find((t) => t.title === title)!;
  const done = reducer(state, { type: 'done', id: task.id });
  const tasks = { ...done.tasks };
  for (const t of Object.values(tasks)) {
    if (t.completedAt && !state.tasks[t.id]?.completedAt) {
      tasks[t.id] = { ...t, completedAt: at };
    }
  }
  return { ...done, tasks };
}

describe('journal', () => {
  it('groups steps by day, most recent first, and separates finished parents', () => {
    let state = buildState();
    state = completeAt(state, 'Open file', NOW - 2 * DAY);
    state = completeAt(state, 'Add parameter', NOW - DAY);
    state = completeAt(state, 'Run tests', NOW - DAY); // cascades: goal done too
    const days = summarizeDays(state, NOW);
    expect(days).toHaveLength(2);
    expect(days[0].label).toBe('Yesterday');
    expect(days[0].steps.map((s) => s.title)).toEqual(['Add parameter', 'Run tests']);
    expect(days[0].finished).toEqual(['BigW Ticket']);
    expect(days[1].steps.map((s) => s.title)).toEqual(['Open file']);
    expect(days[0].steps[0].goalTitle).toBe('BigW Ticket');
  });

  it('lastActiveDay skips today and empty days', () => {
    let state = buildState();
    state = completeAt(state, 'Open file', NOW - 3 * DAY); // Sunday
    state = completeAt(state, 'Add parameter', NOW); // today
    const last = lastActiveDay(state, NOW);
    expect(last).not.toBeNull();
    expect(last!.steps.map((s) => s.title)).toEqual(['Open file']);
    expect(last!.label).not.toBe('Today');
    expect(last!.label).not.toBe('Yesterday');
  });

  it('completedToday reflects only finishes from today', () => {
    let state = buildState();
    state = completeAt(state, 'Open file', NOW - DAY);
    expect(completedToday(state, NOW)).toBe(false);
    state = completeAt(state, 'Add parameter', NOW);
    expect(completedToday(state, NOW)).toBe(true);
  });
});
