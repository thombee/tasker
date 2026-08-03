export type TaskStatus = 'todo' | 'done' | 'skipped';

// Every node — goal, task, subtask, checklist item — is just a Task.
export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  parentId: string | null;
  childIds: string[];
  notes: string;
  estimateMinutes: number | null;
  createdAt: number;
  completedAt: number | null;
  // For tasks that are really questions ("do pothos need drainage?"): the
  // answer you wrote to complete it. Kept as a small knowledge record.
  answer?: string;
}

export interface HistoryEntry {
  kind: 'done' | 'skip';
  changes: { id: string; prevStatus: TaskStatus }[];
}

// A captured complaint / friction point. Lives above the Work/Life split so a
// gripe can be logged from anywhere, then reviewed: promoted into a goal to
// solve, or consciously let go. Never silently deleted.
export interface Gripe {
  id: string;
  text: string;
  createdAt: number;
  // null while open; set when resolved. 'promoted' → became a goal, 'letgo' →
  // deliberately dropped.
  resolvedAt: number | null;
  resolution: 'promoted' | 'letgo' | null;
}

export interface AppState {
  tasks: Record<string, Task>;
  rootIds: string[];
  history: HistoryEntry[];
  // Root task that quick-captured stray thoughts land in; created on first
  // capture and kept as the last goal so it never jumps the queue.
  inboxId: string | null;
  // Set when the user "parks" for a break/day: an optional breadcrumb note.
  // While parked, the app rests on a calm screen showing only the next step.
  parked: { note: string; at: number } | null;
  // Today's chosen journey: execution only traverses these goals while the
  // date matches. Null (or a stale date) means no filter — all goals are live.
  today: { date: string; goalIds: string[] } | null;
}
