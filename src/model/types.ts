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
  // A single Done can cascade upward (parent auto-completes when all its
  // children are done), so one entry may hold several status changes.
  changes: { id: string; prevStatus: TaskStatus }[];
}

export interface AppState {
  tasks: Record<string, Task>;
  rootIds: string[];
  history: HistoryEntry[];
}
