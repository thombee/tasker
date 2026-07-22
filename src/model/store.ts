import { AppState, HistoryEntry, Task, TaskStatus } from './types';

const STORAGE_KEY = 'tasker.state.v1';
const HISTORY_LIMIT = 100;

export const emptyState: AppState = { tasks: {}, rootIds: [], history: [] };

export type Action =
  | { type: 'addGoal'; title: string }
  | { type: 'addChild'; parentId: string | null; title: string }
  | { type: 'breakDown'; id: string; titles: string[] }
  | { type: 'done'; id: string }
  | { type: 'skip'; id: string }
  | { type: 'undo' }
  | { type: 'rename'; id: string; title: string }
  | { type: 'setNotes'; id: string; notes: string }
  | { type: 'setEstimate'; id: string; minutes: number | null }
  | { type: 'setStatus'; id: string; status: TaskStatus }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; dir: -1 | 1 }
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

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'addGoal': {
      const title = action.title.trim();
      if (!title) return state;
      const task = newTask(title, null);
      return {
        ...state,
        tasks: { ...state.tasks, [task.id]: task },
        rootIds: [...state.rootIds, task.id],
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

    case 'done': {
      const task = state.tasks[action.id];
      if (!task || task.status === 'done') return state;
      const tasks = { ...state.tasks };
      const changes: HistoryEntry['changes'] = [{ id: task.id, prevStatus: task.status }];
      tasks[task.id] = { ...task, status: 'done', completedAt: Date.now() };
      // Cascade upward: a parent whose children are now all done is finished
      // too — the user never has to re-confirm work they already did.
      let parentId = task.parentId;
      while (parentId) {
        const parent = tasks[parentId];
        if (
          parent.status === 'todo' &&
          parent.childIds.every((c) => tasks[c].status === 'done')
        ) {
          changes.push({ id: parent.id, prevStatus: parent.status });
          tasks[parent.id] = { ...parent, status: 'done', completedAt: Date.now() };
          parentId = parent.parentId;
        } else {
          break;
        }
      }
      return pushHistory({ ...state, tasks }, { kind: 'done', changes });
    }

    case 'skip': {
      const task = state.tasks[action.id];
      if (!task || task.status !== 'todo') return state;
      const tasks = {
        ...state.tasks,
        [task.id]: { ...task, status: 'skipped' as TaskStatus },
      };
      return pushHistory({ ...state, tasks }, {
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
      return { tasks, rootIds, history };
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
  return {
    tasks: state.tasks,
    rootIds: state.rootIds.filter((id) => state.tasks[id]),
    history: Array.isArray(state.history) ? state.history : [],
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
