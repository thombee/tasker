import { dayKey } from './dates';
import { findCurrent, goalOf } from './traversal';
import { AppState, HistoryEntry, Task, TaskStatus } from './types';

const STORAGE_KEY = 'tasker.state.v1';
const HISTORY_LIMIT = 100;

export const emptyState: AppState = {
  tasks: {},
  rootIds: [],
  history: [],
  inboxId: null,
  parked: null,
  today: null,
};

export type Action =
  | { type: 'addGoal'; title: string }
  | { type: 'addChild'; parentId: string | null; title: string }
  | { type: 'breakDown'; id: string; titles: string[] }
  | { type: 'capture'; title: string }
  | { type: 'nextGoal' }
  | { type: 'park'; note: string }
  | { type: 'resume' }
  | { type: 'setToday'; goalIds: string[] }
  | { type: 'clearToday' }
  | { type: 'done'; id: string }
  | { type: 'skip'; id: string }
  | { type: 'undo' }
  | { type: 'rename'; id: string; title: string }
  | { type: 'setNotes'; id: string; notes: string }
  | { type: 'setEstimate'; id: string; minutes: number | null }
  | { type: 'setStatus'; id: string; status: TaskStatus }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; dir: -1 | 1 }
  | { type: 'indent'; id: string }
  | { type: 'outdent'; id: string }
  | { type: 'reparent'; id: string; parentId: string | null }
  | { type: 'import'; state: AppState };

function newTask(title: string, parentId: string | null): Task {
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    status: 'todo',
    parentId,
    childIds: [],
    notes: '',
    estimateMinutes: null,
    createdAt: Date.now(),
    completedAt: null,
  };
}

function pushHistory(state: AppState, entry: HistoryEntry): AppState {
  const history = [...state.history, entry].slice(-HISTORY_LIMIT);
  return { ...state, history };
}

// The Backlog (captured stray thoughts) always sits last among the goals so
// it never jumps the execution queue ahead of real work.
function keepBacklogLast(state: AppState): AppState {
  if (!state.inboxId) return state;
  const idx = state.rootIds.indexOf(state.inboxId);
  if (idx < 0 || idx === state.rootIds.length - 1) return state;
  const rootIds = state.rootIds.filter((id) => id !== state.inboxId);
  rootIds.push(state.inboxId);
  return { ...state, rootIds };
}

// Is `maybe` inside the subtree rooted at `ancestor`? Used to block moving a
// task into its own descendant (which would orphan a cycle).
function isDescendant(state: AppState, ancestor: string, maybe: string): boolean {
  let cur: Task | undefined = state.tasks[maybe];
  while (cur && cur.parentId) {
    if (cur.parentId === ancestor) return true;
    cur = state.tasks[cur.parentId];
  }
  return false;
}

function reparentTask(
  state: AppState,
  id: string,
  newParentId: string | null,
  afterId?: string,
): AppState {
  const task = state.tasks[id];
  if (!task) return state;
  if (newParentId === id) return state;
  if (newParentId && (!state.tasks[newParentId] || isDescendant(state, id, newParentId))) {
    return state;
  }
  if ((task.parentId ?? null) === newParentId && !afterId) {
    // Already there with no reordering requested.
    return state;
  }

  const tasks = { ...state.tasks };
  let rootIds = [...state.rootIds];

  // Detach from current location.
  if (task.parentId && tasks[task.parentId]) {
    const oldParent = tasks[task.parentId];
    tasks[oldParent.id] = {
      ...oldParent,
      childIds: oldParent.childIds.filter((c) => c !== id),
    };
  } else {
    rootIds = rootIds.filter((r) => r !== id);
  }

  // Attach at the new location.
  if (newParentId) {
    const newParent = tasks[newParentId];
    const childIds = [...newParent.childIds];
    const at = afterId ? childIds.indexOf(afterId) : -1;
    childIds.splice(at >= 0 ? at + 1 : childIds.length, 0, id);
    tasks[newParent.id] = { ...newParent, childIds };
  } else {
    const at = afterId ? rootIds.indexOf(afterId) : -1;
    rootIds.splice(at >= 0 ? at + 1 : rootIds.length, 0, id);
  }

  tasks[id] = { ...task, parentId: newParentId };
  return keepBacklogLast({ ...state, tasks, rootIds });
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'addGoal': {
      const title = action.title.trim();
      if (!title) return state;
      const task = newTask(title, null);
      const rootIds = [...state.rootIds];
      const inboxIndex = state.inboxId ? rootIds.indexOf(state.inboxId) : -1;
      if (inboxIndex >= 0) rootIds.splice(inboxIndex, 0, task.id);
      else rootIds.push(task.id);
      return {
        ...state,
        tasks: { ...state.tasks, [task.id]: task },
        rootIds,
      };
    }

    case 'addChild': {
      if (action.parentId === null) {
        return reducer(state, { type: 'addGoal', title: action.title });
      }
      const title = action.title.trim();
      const parent = state.tasks[action.parentId];
      if (!title || !parent) return state;
      const task = newTask(title, parent.id);
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [task.id]: task,
          [parent.id]: { ...parent, childIds: [...parent.childIds, task.id] },
        },
      };
    }

    case 'breakDown': {
      const parent = state.tasks[action.id];
      if (!parent) return state;
      const titles = action.titles.map((t) => t.trim()).filter(Boolean);
      if (titles.length === 0) return state;
      const tasks = { ...state.tasks };
      const childIds = [...parent.childIds];
      for (const title of titles) {
        const child = newTask(title, parent.id);
        tasks[child.id] = child;
        childIds.push(child.id);
      }
      tasks[parent.id] = { ...parent, childIds };
      return { ...state, tasks };
    }

    case 'capture': {
      const title = action.title.trim();
      if (!title) return state;
      let next = state;
      let inboxId = state.inboxId;
      if (!inboxId || !state.tasks[inboxId]) {
        const inbox = newTask('Backlog', null);
        inboxId = inbox.id;
        next = {
          ...state,
          tasks: { ...state.tasks, [inbox.id]: inbox },
          rootIds: [...state.rootIds, inbox.id],
          inboxId,
        };
      }
      return reducer(next, { type: 'addChild', parentId: inboxId, title });
    }

    case 'nextGoal': {
      // Move on to the next goal without skipping anything: the current
      // goal rotates to the back of the journey, statuses untouched.
      const currentId = findCurrent(state);
      if (!currentId) return state;
      const goalId = goalOf(state, currentId).id;
      const rootIds = state.rootIds.filter((id) => id !== goalId);
      const inboxIndex =
        state.inboxId && state.inboxId !== goalId
          ? rootIds.indexOf(state.inboxId)
          : -1;
      if (inboxIndex >= 0) rootIds.splice(inboxIndex, 0, goalId);
      else rootIds.push(goalId);
      return { ...state, rootIds };
    }

    case 'park': {
      return { ...state, parked: { note: action.note.trim(), at: Date.now() } };
    }

    case 'resume': {
      return state.parked ? { ...state, parked: null } : state;
    }

    case 'setToday': {
      // Commit to a handful of goals for today. Backlog can't be committed to,
      // and an empty pick means "no filter" (all goals live).
      const goalIds = action.goalIds.filter(
        (id) => state.rootIds.includes(id) && id !== state.inboxId,
      );
      return {
        ...state,
        today: goalIds.length ? { date: dayKey(Date.now()), goalIds } : null,
      };
    }

    case 'clearToday': {
      return state.today ? { ...state, today: null } : state;
    }

    case 'done': {
      const task = state.tasks[action.id];
      if (!task || task.status === 'done') return state;
      // Parents are never auto-completed: subtasks are often only the *next*
      // step, not the whole job. When the last child finishes, the traversal
      // surfaces the parent itself and the user confirms — Done or Too Big.
      const tasks = {
        ...state.tasks,
        [task.id]: { ...task, status: 'done' as TaskStatus, completedAt: Date.now() },
      };
      // Acting on a task means the user is back — clear any parked state.
      return pushHistory({ ...state, tasks, parked: null }, {
        kind: 'done',
        changes: [{ id: task.id, prevStatus: task.status }],
      });
    }

    case 'skip': {
      const task = state.tasks[action.id];
      if (!task || task.status !== 'todo') return state;
      const tasks = {
        ...state.tasks,
        [task.id]: { ...task, status: 'skipped' as TaskStatus },
      };
      return pushHistory({ ...state, tasks, parked: null }, {
        kind: 'skip',
        changes: [{ id: task.id, prevStatus: task.status }],
      });
    }

    case 'undo': {
      const entry = state.history[state.history.length - 1];
      if (!entry) return state;
      const tasks = { ...state.tasks };
      for (const change of entry.changes) {
        const task = tasks[change.id];
        if (task) {
          tasks[change.id] = { ...task, status: change.prevStatus, completedAt: null };
        }
      }
      return { ...state, tasks, history: state.history.slice(0, -1) };
    }

    case 'rename': {
      const task = state.tasks[action.id];
      const title = action.title.trim();
      if (!task || !title) return state;
      return { ...state, tasks: { ...state.tasks, [task.id]: { ...task, title } } };
    }

    case 'setNotes': {
      const task = state.tasks[action.id];
      if (!task) return state;
      return {
        ...state,
        tasks: { ...state.tasks, [task.id]: { ...task, notes: action.notes } },
      };
    }

    case 'setEstimate': {
      const task = state.tasks[action.id];
      if (!task) return state;
      return {
        ...state,
        tasks: { ...state.tasks, [task.id]: { ...task, estimateMinutes: action.minutes } },
      };
    }

    case 'setStatus': {
      const task = state.tasks[action.id];
      if (!task || task.status === action.status) return state;
      const tasks = {
        ...state.tasks,
        [task.id]: {
          ...task,
          status: action.status,
          completedAt: action.status === 'done' ? Date.now() : null,
        },
      };
      // Reopening a task must reopen its finished ancestors, otherwise the
      // traversal would never reach it again.
      if (action.status === 'todo') {
        let parentId = task.parentId;
        while (parentId) {
          const parent = tasks[parentId];
          if (parent.status !== 'todo') {
            tasks[parentId] = { ...parent, status: 'todo', completedAt: null };
          }
          parentId = parent.parentId;
        }
      }
      return { ...state, tasks };
    }

    case 'remove': {
      const task = state.tasks[action.id];
      if (!task) return state;
      const tasks = { ...state.tasks };
      const removed = new Set<string>();
      const stack = [action.id];
      while (stack.length > 0) {
        const id = stack.pop()!;
        const t = tasks[id];
        if (!t) continue;
        removed.add(id);
        stack.push(...t.childIds);
        delete tasks[id];
      }
      let rootIds = state.rootIds;
      if (task.parentId && tasks[task.parentId]) {
        const parent = tasks[task.parentId];
        tasks[parent.id] = {
          ...parent,
          childIds: parent.childIds.filter((c) => c !== task.id),
        };
      } else {
        rootIds = rootIds.filter((id) => id !== task.id);
      }
      const history = state.history
        .map((e) => ({ ...e, changes: e.changes.filter((c) => !removed.has(c.id)) }))
        .filter((e) => e.changes.length > 0);
      const inboxId =
        state.inboxId && removed.has(state.inboxId) ? null : state.inboxId;
      const today = state.today
        ? {
            ...state.today,
            goalIds: state.today.goalIds.filter((id) => !removed.has(id)),
          }
        : null;
      return {
        tasks,
        rootIds,
        history,
        inboxId,
        parked: state.parked,
        today: today && today.goalIds.length ? today : null,
      };
    }

    case 'move': {
      const task = state.tasks[action.id];
      if (!task) return state;
      const siblings = task.parentId
        ? state.tasks[task.parentId].childIds
        : state.rootIds;
      const from = siblings.indexOf(task.id);
      const to = from + action.dir;
      if (from < 0 || to < 0 || to >= siblings.length) return state;
      const next = [...siblings];
      [next[from], next[to]] = [next[to], next[from]];
      if (task.parentId) {
        const parent = state.tasks[task.parentId];
        return {
          ...state,
          tasks: { ...state.tasks, [parent.id]: { ...parent, childIds: next } },
        };
      }
      return { ...state, rootIds: next };
    }

    case 'indent': {
      // Tuck a task under the sibling directly above it.
      const task = state.tasks[action.id];
      if (!task) return state;
      const siblings = task.parentId
        ? state.tasks[task.parentId].childIds
        : state.rootIds;
      const idx = siblings.indexOf(action.id);
      if (idx <= 0) return state; // no sibling above to nest under
      return reparentTask(state, action.id, siblings[idx - 1]);
    }

    case 'outdent': {
      // Lift a task out to sit just after its parent — at the top level this
      // promotes a Backlog item (or any subtask) into its own goal.
      const task = state.tasks[action.id];
      if (!task || !task.parentId) return state;
      const parent = state.tasks[task.parentId];
      return reparentTask(state, action.id, parent.parentId, parent.id);
    }

    case 'reparent': {
      return reparentTask(state, action.id, action.parentId);
    }

    case 'import': {
      return sanitize(action.state);
    }
  }
}

function sanitize(raw: unknown): AppState {
  if (
    !raw ||
    typeof raw !== 'object' ||
    typeof (raw as AppState).tasks !== 'object' ||
    !Array.isArray((raw as AppState).rootIds)
  ) {
    throw new Error('Not a valid tasker backup file');
  }
  const state = raw as AppState;
  // Migration: the "Inbox" root was renamed to "Backlog". Only rename the
  // auto-created default title, never a name the user changed themselves.
  const tasks = { ...state.tasks };
  if (
    typeof state.inboxId === 'string' &&
    tasks[state.inboxId] &&
    tasks[state.inboxId].title === 'Inbox'
  ) {
    tasks[state.inboxId] = { ...tasks[state.inboxId], title: 'Backlog' };
  }
  return {
    tasks,
    rootIds: state.rootIds.filter((id) => tasks[id]),
    history: Array.isArray(state.history) ? state.history : [],
    inboxId:
      typeof state.inboxId === 'string' && state.tasks[state.inboxId]
        ? state.inboxId
        : null,
    parked:
      state.parked && typeof state.parked === 'object' &&
      typeof state.parked.at === 'number'
        ? { note: String(state.parked.note ?? ''), at: state.parked.at }
        : null,
    today:
      state.today &&
      typeof state.today === 'object' &&
      typeof state.today.date === 'string' &&
      Array.isArray(state.today.goalIds)
        ? {
            date: state.today.date,
            goalIds: state.today.goalIds.filter((id) => tasks[id]),
          }
        : null,
  };
}

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — the app still works for this session.
  }
}
