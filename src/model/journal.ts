import { dayKey } from './dates';
import { goalOf } from './traversal';
import { AppState } from './types';

export { dayKey };

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

// A plain-text recap of one day, grouped by goal — the copy you paste into a
// standup, a 1:1, or a work log. Evidence of the day's output.
export function daySummaryText(day: DayGroup): string {
  const byGoal = new Map<string, string[]>();
  for (const step of day.steps) {
    const arr = byGoal.get(step.goalTitle) ?? [];
    arr.push(step.title);
    byGoal.set(step.goalTitle, arr);
  }
  const lines: string[] = [];
  for (const [goal, steps] of byGoal) {
    lines.push(`• ${goal}: ${steps.join(', ')}`);
  }
  for (const finished of day.finished) {
    lines.push(`• Completed: ${finished}`);
  }
  return `${day.label} — what I did:\n${lines.join('\n')}`;
}

export interface HeatCell {
  key: string;
  count: number;
  future: boolean;
}

// Completed leaf steps per local day (parents excluded so nothing is counted
// twice).
function leafCountsByDay(state: AppState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of Object.values(state.tasks)) {
    if (task.status !== 'done' || !task.completedAt || task.childIds.length > 0) continue;
    const key = dayKey(task.completedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// A calm contribution-style grid: `weeks` columns, each a Sun–Sat week, the
// last column containing today. Evidence of consistency without a streak to
// break.
export function heatmap(state: AppState, weeks = 12, now = Date.now()): HeatCell[][] {
  const counts = leafCountsByDay(state);
  const todayWeekday = new Date(now).getDay(); // 0 = Sunday
  const lastDay = now + (6 - todayWeekday) * 86400000; // Saturday of this week
  const total = weeks * 7;
  const cells: HeatCell[] = [];
  for (let i = total - 1; i >= 0; i--) {
    const ts = lastDay - i * 86400000;
    const key = dayKey(ts);
    const future = ts > now && key !== dayKey(now);
    cells.push({ key, count: future ? 0 : counts.get(key) ?? 0, future });
  }
  const columns: HeatCell[][] = [];
  for (let c = 0; c < weeks; c++) columns.push(cells.slice(c * 7, c * 7 + 7));
  return columns;
}

// 0 (nothing) … 4 (a lot) — maps a day's step count to a shade band.
export function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 7) return 3;
  return 4;
}
