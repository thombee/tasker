import { dayKey } from './dates';
import { AppState, Task } from './types';

// Is a "today's journey" filter in effect for the given day?
export function todayActive(state: AppState, now = Date.now()): boolean {
  return !!(
    state.today &&
    state.today.date === dayKey(now) &&
    state.today.goalIds.length > 0
  );
}

// The goals execution should walk: today's chosen set when active (in
// rootIds order), otherwise every goal.
export function activeRoots(state: AppState, now = Date.now()): string[] {
  if (todayActive(state, now)) {
    const set = new Set(state.today!.goalIds);
    return state.rootIds.filter((id) => set.has(id));
  }
  return state.rootIds;
}

// The heart of execution mode: walk the tree and land on the smallest
// unfinished task. If a node has an incomplete child, descend; otherwise
// the node itself is the current task.
export function findCurrent(state: AppState, now = Date.now()): string | null {
  for (const rootId of activeRoots(state, now)) {
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
