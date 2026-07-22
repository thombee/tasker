import { Dispatch, useState } from 'react';
import { Action } from '../model/store';
import { AppState } from '../model/types';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  id: string;
  depth: number;
}

export default function TreeNode({ state, dispatch, id, depth }: Props) {
  const task = state.tasks[id];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task?.title ?? '');
  const [addingChild, setAddingChild] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  if (!task) return null;

  const isBacklog = id === state.inboxId;
  const siblings = task.parentId ? state.tasks[task.parentId].childIds : state.rootIds;
  const idx = siblings.indexOf(id);
  const canIndent = idx > 0;
  const canOutdent = task.parentId !== null;
  const parentIsBacklog = task.parentId === state.inboxId;

  function saveTitle() {
    dispatch({ type: 'rename', id, title: draft });
    setEditing(false);
  }

  function addChild() {
    if (childTitle.trim()) {
      dispatch({ type: 'addChild', parentId: id, title: childTitle });
      setChildTitle('');
    } else {
      setAddingChild(false);
    }
  }

  function toggleStatus() {
    dispatch({
      type: 'setStatus',
      id,
      status: task.status === 'todo' ? 'done' : 'todo',
    });
  }

  return (
    <div className={`node depth-${Math.min(depth, 6)}`}>
      <div className={`node-row status-${task.status}${isBacklog ? ' is-backlog' : ''}`}>
        <button
          className="check"
          title={task.status === 'todo' ? 'Mark done' : 'Reopen'}
          onClick={toggleStatus}
        >
          {task.status === 'done' ? '✓' : task.status === 'skipped' ? '~' : '○'}
        </button>

        {editing ? (
          <input
            autoFocus
            className="title-edit"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button
            className="node-title"
            onClick={() => {
              setDraft(task.title);
              setEditing(true);
            }}
            title="Click to rename"
          >
            {task.title}
            {isBacklog && <span className="tag">backlog</span>}
            {task.status === 'skipped' && <span className="tag">skipped</span>}
            {task.estimateMinutes && <span className="tag">{task.estimateMinutes}m</span>}
          </button>
        )}

        <span className="node-actions">
          <button title="Add step inside" onClick={() => setAddingChild(true)}>
            +
          </button>
          {canOutdent && (
            <button
              title={parentIsBacklog ? 'Make this its own goal' : 'Move out one level'}
              onClick={() => dispatch({ type: 'outdent', id })}
            >
              ⇤
            </button>
          )}
          {canIndent && (
            <button
              title="Nest under the item above"
              onClick={() => dispatch({ type: 'indent', id })}
            >
              ⇥
            </button>
          )}
          <button title="Move up" onClick={() => dispatch({ type: 'move', id, dir: -1 })}>
            ↑
          </button>
          <button title="Move down" onClick={() => dispatch({ type: 'move', id, dir: 1 })}>
            ↓
          </button>
          <button title="Notes & estimate" onClick={() => setShowDetails(!showDetails)}>
            ⋯
          </button>
          <button
            className="node-delete"
            title="Delete (and everything inside)"
            onClick={() => {
              const count = countBranch(state, id);
              if (
                count === 1 ||
                confirm(`Delete "${task.title}" and the ${count - 1} steps inside it?`)
              ) {
                dispatch({ type: 'remove', id });
              }
            }}
          >
            ×
          </button>
        </span>
      </div>

      {showDetails && (
        <div className="node-details">
          <textarea
            value={task.notes}
            placeholder="Notes…"
            rows={2}
            onChange={(e) => dispatch({ type: 'setNotes', id, notes: e.target.value })}
          />
          <label className="muted small">
            estimate
            <input
              type="number"
              min={1}
              value={task.estimateMinutes ?? ''}
              onChange={(e) =>
                dispatch({
                  type: 'setEstimate',
                  id,
                  minutes: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
            min
          </label>
        </div>
      )}

      {(task.childIds.length > 0 || addingChild) && (
        <div className="node-children">
          {task.childIds.map((childId) => (
            <TreeNode
              key={childId}
              id={childId}
              depth={depth + 1}
              state={state}
              dispatch={dispatch}
            />
          ))}

          {addingChild && (
            <div className="node-add">
              <input
                autoFocus
                value={childTitle}
                onChange={(e) => setChildTitle(e.target.value)}
                onBlur={() => setAddingChild(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addChild();
                  if (e.key === 'Escape') setAddingChild(false);
                }}
                placeholder="New step…"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function countBranch(state: AppState, id: string): number {
  const task = state.tasks[id];
  if (!task) return 0;
  return 1 + task.childIds.reduce((sum, c) => sum + countBranch(state, c), 0);
}
