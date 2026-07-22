import { AppState, Task } from './types';

// The heart of execution mode: walk the tree and land on the smallest
// unfinished task. If a node has an incomplete child, descend; otherwise
// the node itself is the current task.
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
