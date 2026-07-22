import { goalOf } from './traversal';
import { AppState } from './types';

export interface JournalStep {
  id: string;
  title: string;
  goalTitle: string;
  completedAt: number;
}

export interface DayGroup {
  key: string; // local date, e.g. "2026-07-22"
  label: string; // "Today", "Yesterday", or "Monday 20 July"
  steps: JournalStep[]; // leaf tasks — the physical actions taken
  finished: string[]; // titles of parent tasks/goals wrapped up that day
}

export function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function dayLabel(key: string, now: number): string {
  if (key === dayKey(now)) return 'Today';
  if (key === dayKey(now - 86400000)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// Group completed work by local day, most recent day first. Leaf tasks are
// the steps you actually did; parents that completed count as things you
// finished outright.
export function summarizeDays(state: AppState, now = Date.now()): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const task of Object.values(state.tasks)) {
    if (task.status !== 'done' || !task.completedAt) continue;
    const key = dayKey(task.completedAt);
    let group = groups.get(key);
    if (!group) {
      group = { key, label: dayLabel(key, now), steps: [], finished: [] };
      groups.set(key, group);
    }
    if (task.childIds.length === 0) {
      group.steps.push({
        id: task.id,
        title: task.title,
        goalTitle: goalOf(state, task.id).title,
        completedAt: task.completedAt,
      });
    } else {
      group.finished.push(task.title);
    }
  }
  const days = [...groups.values()];
  for (const day of days) day.steps.sort((a, b) => a.completedAt - b.completedAt);
  days.sort((a, b) => (a.key < b.key ? 1 : -1));
  return days;
}

// The most recent day with completed work before today — "Yesterday" on a
// normal morning, "Friday 18 July" after a weekend off.
export function lastActiveDay(state: AppState, now = Date.now()): DayGroup | null {
  const today = dayKey(now);
  return summarizeDays(state, now).find((d) => d.key < today) ?? null;
}

export function completedToday(state: AppState, now = Date.now()): boolean {
  const today = dayKey(now);
  return Object.values(state.tasks).some(
    (t) => t.status === 'done' && t.completedAt && dayKey(t.completedAt) === today,
  );
}
