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
}

export interface HistoryEntry {
  kind: 'done' | 'skip';
  changes: { id: string; prevStatus: TaskStatus }[];
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
