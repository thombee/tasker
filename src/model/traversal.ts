import { dayKey } from './dates';
import { AppState, Task } from './types';

// Is a set of "today" goals marked for the given day? Today no longer hides
// anything — it just moves the chosen goals to the front and highlights them,
// so this only drives the marker and the "today's goals done" beat.
export function todayActive(state: AppState, now = Date.now()): boolean {
  return !!(
    state.today &&
    state.today.date === dayKey(now) &&
    state.today.goalIds.length > 0
  );
}

// Is a given goal one of today's chosen ones (still present and for today)?
export function isTodayGoal(state: AppState, id: string, now = Date.now()): boolean {
  return todayActive(state, now) && state.today!.goalIds.includes(id);
}

// All of today's goals finished — the gentle "today done" beat. Ignores
// goals that were removed since they were chosen.
export function todayComplete(state: AppState, now = Date.now()): boolean {
  if (!todayActive(state, now)) return false;
  const live = state.today!.goalIds.filter((id) => state.tasks[id]);
  if (live.length === 0) return false;
  return live.every((id) => remainingSteps(state, id) === 0);
}

// The heart of execution mode: walk every goal in order and land on the
// smallest unfinished task. Nothing is filtered out — today's goals simply
// sit at the front of rootIds, so they surface first without hiding the rest.
export function findCurrent(state: AppState): string | null {
  for (const rootId of state.rootIds) {
    const found = descend(state, rootId);
    if (found) return found;
  }
  return null;
}

function descend(state: AppState, id: string): string | null {
  const task = state.tasks[id];
  if (!task || task.status !== 'todo') return null;
  for (const childId of task.childIds) {
    const found = descend(state, childId);
    if (found) return found;
  }
  return id;
}

// How many actionable steps remain inside a branch — a todo node with no
// remaining todo children counts as one step (itself).
export function remainingSteps(state: AppState, id: string): number {
  const task = state.tasks[id];
  if (!task || task.status !== 'todo') return 0;
  const inChildren = task.childIds.reduce(
    (sum, childId) => sum + remainingSteps(state, childId),
    0,
  );
  return inChildren > 0 ? inChildren : 1;
}

export function goalOf(state: AppState, id: string): Task {
  let task = state.tasks[id];
  while (task.parentId && state.tasks[task.parentId]) {
    task = state.tasks[task.parentId];
  }
  return task;
}
