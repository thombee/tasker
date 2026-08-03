import { describe, expect, it } from 'vitest';
import { emptyState, reducer, Action } from './store';
import {
  ancestors,
  findCurrent,
  goalOf,
  isTodayGoal,
  remainingSteps,
  todayActive,
  todayComplete,
} from './traversal';
import { AppState } from './types';

function apply(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reducer, state);
}

function idOf(state: AppState, title: string): string {
  const task = Object.values(state.tasks).find((t) => t.title === title);
  if (!task) throw new Error(`no task titled ${title}`);
  return task.id;
}

function buildJourney(): AppState {
  let state = apply(emptyState, { type: 'addGoal', title: 'BigW Ticket' });
  state = apply(state, {
    type: 'breakDown',
    id: idOf(state, 'BigW Ticket'),
    titles: ['Implement backend', 'Implement frontend'],
  });
  state = apply(state, {
    type: 'breakDown',
    id: idOf(state, 'Implement backend'),
    titles: ['Open endpoint file', 'Add parameter'],
  });
  return state;
}

describe('findCurrent', () => {
  it('returns null for an empty state', () => {
    expect(findCurrent(emptyState)).toBeNull();
  });

  it('lands on the deepest first incomplete task', () => {
    const state = buildJourney();
    expect(findCurrent(state)).toBe(idOf(state, 'Open endpoint file'));
  });

  it('advances to the next sibling after done', () => {
    let state = buildJourney();
    state = apply(state, { type: 'done', id: idOf(state, 'Open endpoint file') });
    expect(findCurrent(state)).toBe(idOf(state, 'Add parameter'));
  });

  it('surfaces the parent for confirmation when all children are done', () => {
    let state = buildJourney();
    state = apply(
      state,
      { type: 'done', id: idOf(state, 'Open endpoint file') },
      { type: 'done', id: idOf(state, 'Add parameter') },
    );
    // Subtasks may only have been the *next* steps, not the whole job — the
    // parent is never auto-completed; the user confirms it.
    expect(state.tasks[idOf(state, 'Implement backend')].status).toBe('todo');
    expect(findCurrent(state)).toBe(idOf(state, 'Implement backend'));
    state = apply(state, { type: 'done', id: idOf(state, 'Implement backend') });
    expect(findCurrent(state)).toBe(idOf(state, 'Implement frontend'));
  });

  it('a confirmed parent stays confirmable with more steps via breakDown', () => {
    let state = buildJourney();
    state = apply(
      state,
      { type: 'done', id: idOf(state, 'Open endpoint file') },
      { type: 'done', id: idOf(state, 'Add parameter') },
      { type: 'breakDown', id: idOf(state, 'Implement backend'), titles: ['Write tests'] },
    );
    expect(findCurrent(state)).toBe(idOf(state, 'Write tests'));
  });

  it('skipped tasks are stepped over', () => {
    let state = buildJourney();
    state = apply(state, { type: 'skip', id: idOf(state, 'Open endpoint file') });
    expect(findCurrent(state)).toBe(idOf(state, 'Add parameter'));
  });

  it('surfaces the parent when children are only done/skipped', () => {
    let state = buildJourney();
    state = apply(
      state,
      { type: 'skip', id: idOf(state, 'Open endpoint file') },
      { type: 'done', id: idOf(state, 'Add parameter') },
    );
    // One child skipped, one done: the parent is not auto-completed, the
    // user decides whether "Implement backend" is really finished.
    expect(findCurrent(state)).toBe(idOf(state, 'Implement backend'));
  });

  it('moves to the next goal when the first is fully complete', () => {
    let state = apply(
      buildJourney(),
      { type: 'addGoal', title: 'SuccessFactors Review' },
    );
    state = apply(
      state,
      { type: 'done', id: idOf(state, 'Open endpoint file') },
      { type: 'done', id: idOf(state, 'Add parameter') },
      { type: 'done', id: idOf(state, 'Implement backend') },
      { type: 'done', id: idOf(state, 'Implement frontend') },
      { type: 'done', id: idOf(state, 'BigW Ticket') },
    );
    expect(findCurrent(state)).toBe(idOf(state, 'SuccessFactors Review'));
  });
});

describe('undo', () => {
  it('reverses the last done', () => {
    let state = buildJourney();
    state = apply(
      state,
      { type: 'done', id: idOf(state, 'Open endpoint file') },
      { type: 'done', id: idOf(state, 'Add parameter') },
    );
    state = apply(state, { type: 'undo' });
    expect(state.tasks[idOf(state, 'Add parameter')].status).toBe('todo');
    expect(state.tasks[idOf(state, 'Open endpoint file')].status).toBe('done');
    expect(findCurrent(state)).toBe(idOf(state, 'Add parameter'));
  });

  it('restores a skipped task', () => {
    let state = buildJourney();
    state = apply(state, { type: 'skip', id: idOf(state, 'Open endpoint file') });
    state = apply(state, { type: 'undo' });
    expect(findCurrent(state)).toBe(idOf(state, 'Open endpoint file'));
  });
});

describe('breakDown', () => {
  it('execution immediately continues with the first new child', () => {
    let state = buildJourney();
    const current = idOf(state, 'Open endpoint file');
    state = apply(state, {
      type: 'breakDown',
      id: current,
      titles: ['Open VSCode', 'Click project folder'],
    });
    expect(findCurrent(state)).toBe(idOf(state, 'Open VSCode'));
  });

  it('ignores blank lines', () => {
    let state = buildJourney();
    const before = Object.keys(state.tasks).length;
    state = apply(state, {
      type: 'breakDown',
      id: idOf(state, 'Open endpoint file'),
      titles: ['  ', '', 'Open VSCode'],
    });
    expect(Object.keys(state.tasks).length).toBe(before + 1);
  });
});

describe('quick capture', () => {
  it('creates a Backlog goal on first capture and appends thoughts', () => {
    let state = apply(buildJourney(), { type: 'capture', title: 'Email Sarah back' });
    expect(state.inboxId).toBeTruthy();
    const inbox = state.tasks[state.inboxId!];
    expect(inbox.title).toBe('Backlog');
    expect(inbox.parentId).toBeNull();
    expect(inbox.childIds).toHaveLength(1);
    state = apply(state, { type: 'capture', title: 'Book dentist' });
    expect(state.tasks[state.inboxId!].childIds).toHaveLength(2);
    // Capturing never steals focus from the current task.
    expect(findCurrent(state)).toBe(idOf(state, 'Open endpoint file'));
  });

  it('keeps the Inbox as the last goal when new goals are added', () => {
    let state = apply(buildJourney(), { type: 'capture', title: 'Email Sarah back' });
    state = apply(state, { type: 'addGoal', title: 'SuccessFactors Review' });
    expect(state.rootIds[state.rootIds.length - 1]).toBe(state.inboxId);
    expect(state.rootIds).toHaveLength(3);
  });

  it('recreates the Inbox after it was deleted', () => {
    let state = apply(buildJourney(), { type: 'capture', title: 'One' });
    state = apply(state, { type: 'remove', id: state.inboxId! });
    expect(state.inboxId).toBeNull();
    state = apply(state, { type: 'capture', title: 'Two' });
    expect(state.inboxId).toBeTruthy();
    expect(state.tasks[state.inboxId!].childIds).toHaveLength(1);
  });
});

describe('nextGoal', () => {
  it('rotates to the following goal without changing any statuses', () => {
    let state = apply(buildJourney(), { type: 'addGoal', title: 'SuccessFactors Review' });
    state = apply(state, { type: 'nextGoal' });
    expect(findCurrent(state)).toBe(idOf(state, 'SuccessFactors Review'));
    expect(state.tasks[idOf(state, 'Open endpoint file')].status).toBe('todo');
    // Cycles back around.
    state = apply(state, { type: 'nextGoal' });
    expect(findCurrent(state)).toBe(idOf(state, 'Open endpoint file'));
  });

  it('keeps the Inbox as the last goal when rotating', () => {
    let state = apply(
      buildJourney(),
      { type: 'capture', title: 'a thought' },
      { type: 'addGoal', title: 'Review' },
    );
    state = apply(state, { type: 'nextGoal' });
    expect(findCurrent(state)).toBe(idOf(state, 'Review'));
    expect(state.rootIds[state.rootIds.length - 1]).toBe(state.inboxId);
  });

  it('is a no-op with a single active goal', () => {
    const state = buildJourney();
    expect(apply(state, { type: 'nextGoal' }).rootIds).toEqual(state.rootIds);
  });
});

describe('park', () => {
  it('stores the breadcrumb and clears on resume', () => {
    let state = apply(buildJourney(), { type: 'park', note: '  left off mid-refactor ' });
    expect(state.parked?.note).toBe('left off mid-refactor');
    state = apply(state, { type: 'resume' });
    expect(state.parked).toBeNull();
  });

  it('acting on a task clears the parked state', () => {
    let state = apply(buildJourney(), { type: 'park', note: '' });
    state = apply(state, { type: 'done', id: idOf(state, 'Open endpoint file') });
    expect(state.parked).toBeNull();
  });
});

describe('reparenting', () => {
  function ids(state: AppState, title: string) {
    return idOf(state, title);
  }

  it('indent nests a task under the sibling above it', () => {
    let state = buildJourney();
    // Implement frontend is a sibling of Implement backend under BigW Ticket.
    state = apply(state, { type: 'indent', id: ids(state, 'Implement frontend') });
    const frontend = state.tasks[ids(state, 'Implement frontend')];
    expect(frontend.parentId).toBe(ids(state, 'Implement backend'));
    expect(state.tasks[ids(state, 'Implement backend')].childIds).toContain(
      frontend.id,
    );
  });

  it('indent is a no-op for the first sibling', () => {
    const state = buildJourney();
    const next = apply(state, { type: 'indent', id: ids(state, 'Open endpoint file') });
    expect(next).toBe(state);
  });

  it('outdent lifts a task to sit after its parent', () => {
    let state = buildJourney();
    state = apply(state, { type: 'outdent', id: ids(state, 'Add parameter') });
    const param = state.tasks[ids(state, 'Add parameter')];
    // Was under Implement backend; now a sibling of it under BigW Ticket.
    expect(param.parentId).toBe(ids(state, 'BigW Ticket'));
    const goalKids = state.tasks[ids(state, 'BigW Ticket')].childIds;
    const backendIdx = goalKids.indexOf(ids(state, 'Implement backend'));
    expect(goalKids[backendIdx + 1]).toBe(param.id);
  });

  it('outdent at the top level promotes a Backlog item into its own goal', () => {
    let state = apply(buildJourney(), { type: 'capture', title: 'Water the plants' });
    const item = ids(state, 'Water the plants');
    state = apply(state, { type: 'outdent', id: item });
    expect(state.tasks[item].parentId).toBeNull();
    expect(state.rootIds).toContain(item);
    // Backlog stays last even though the promoted goal was inserted after it.
    expect(state.rootIds[state.rootIds.length - 1]).toBe(state.inboxId);
  });

  it('reparent refuses to move a task into its own descendant', () => {
    const state = buildJourney();
    const next = apply(state, {
      type: 'reparent',
      id: ids(state, 'Implement backend'),
      parentId: ids(state, 'Open endpoint file'),
    });
    expect(next).toBe(state);
  });

  it('reparent can move a branch under another goal', () => {
    let state = apply(buildJourney(), { type: 'addGoal', title: 'Side Project' });
    state = apply(state, {
      type: 'reparent',
      id: ids(state, 'Implement frontend'),
      parentId: ids(state, 'Side Project'),
    });
    expect(state.tasks[ids(state, 'Implement frontend')].parentId).toBe(
      ids(state, 'Side Project'),
    );
    expect(state.tasks[ids(state, 'BigW Ticket')].childIds).not.toContain(
      ids(state, 'Implement frontend'),
    );
  });
});

describe("today's journey", () => {
  function twoGoals(): AppState {
    let state = apply(emptyState, { type: 'addGoal', title: 'BigW Ticket' });
    state = apply(state, {
      type: 'breakDown',
      id: idOf(state, 'BigW Ticket'),
      titles: ['Open file', 'Run tests'],
    });
    state = apply(state, { type: 'addGoal', title: 'SF Review' });
    state = apply(state, {
      type: 'breakDown',
      id: idOf(state, 'SF Review'),
      titles: ['Answer Q1'],
    });
    return state;
  }

  it('moves chosen goals to the front but hides nothing', () => {
    let state = twoGoals();
    // SF Review is added second, so BigW is first by default.
    expect(findCurrent(state)).toBe(idOf(state, 'Open file'));
    state = apply(state, { type: 'setToday', goalIds: [idOf(state, 'SF Review')] });
    expect(todayActive(state)).toBe(true);
    // SF Review now surfaces first…
    expect(findCurrent(state)).toBe(idOf(state, 'Answer Q1'));
    // …but BigW is still there and reachable, not filtered out.
    expect(state.rootIds).toContain(idOf(state, 'BigW Ticket'));
    expect(remainingSteps(state, idOf(state, 'BigW Ticket'))).toBe(2);
    expect(isTodayGoal(state, idOf(state, 'SF Review'))).toBe(true);
    expect(isTodayGoal(state, idOf(state, 'BigW Ticket'))).toBe(false);
  });

  it('non-today goals stay reachable via switch goal', () => {
    let state = twoGoals();
    state = apply(state, { type: 'setToday', goalIds: [idOf(state, 'SF Review')] });
    expect(findCurrent(state)).toBe(idOf(state, 'Answer Q1'));
    state = apply(state, { type: 'nextGoal' });
    expect(findCurrent(state)).toBe(idOf(state, 'Open file')); // reached BigW
  });

  it('a stale date drops the marker but leaves order/reachability intact', () => {
    let state = twoGoals();
    state = apply(state, { type: 'setToday', goalIds: [idOf(state, 'SF Review')] });
    state = { ...state, today: { ...state.today!, date: '2000-01-01' } };
    expect(todayActive(state)).toBe(false);
    // Nothing was hidden, so everything is still reachable.
    expect(findCurrent(state)).toBe(idOf(state, 'Answer Q1'));
  });

  it("finishing today's goals flows on to the rest, not a dead end", () => {
    let state = twoGoals();
    state = apply(state, { type: 'setToday', goalIds: [idOf(state, 'SF Review')] });
    expect(todayComplete(state)).toBe(false);
    state = apply(state, { type: 'done', id: idOf(state, 'Answer Q1') });
    state = apply(state, { type: 'done', id: idOf(state, 'SF Review') });
    expect(todayComplete(state)).toBe(true);
    // Execution keeps going into BigW rather than walling off.
    expect(findCurrent(state)).toBe(idOf(state, 'Open file'));
  });

  it('setToday ignores the Backlog and an empty pick clears the marker', () => {
    let state = apply(twoGoals(), { type: 'capture', title: 'stray' });
    state = apply(state, {
      type: 'setToday',
      goalIds: [state.inboxId!, idOf(state, 'BigW Ticket')],
    });
    expect(state.today!.goalIds).toEqual([idOf(state, 'BigW Ticket')]);
    // Backlog stays last even after the reorder.
    expect(state.rootIds[state.rootIds.length - 1]).toBe(state.inboxId);
    state = apply(state, { type: 'setToday', goalIds: [] });
    expect(state.today).toBeNull();
  });

  it('clearToday drops the marker', () => {
    let state = twoGoals();
    state = apply(state, { type: 'setToday', goalIds: [idOf(state, 'SF Review')] });
    state = apply(state, { type: 'clearToday' });
    expect(state.today).toBeNull();
  });
});

describe('startGoal', () => {
  it('jumps a goal to the front so it surfaces next', () => {
    let state = apply(emptyState, { type: 'addGoal', title: 'First' });
    state = apply(state, {
      type: 'breakDown',
      id: idOf(state, 'First'),
      titles: ['do first thing'],
    });
    state = apply(state, { type: 'addGoal', title: 'Second' });
    state = apply(state, {
      type: 'breakDown',
      id: idOf(state, 'Second'),
      titles: ['do second thing'],
    });
    // Second was added last, so First surfaces by default.
    expect(findCurrent(state)).toBe(idOf(state, 'do first thing'));
    state = apply(state, { type: 'startGoal', id: idOf(state, 'Second') });
    expect(findCurrent(state)).toBe(idOf(state, 'do second thing'));
  });

  it('keeps the Backlog last', () => {
    let state = apply(buildJourney(), { type: 'capture', title: 'stray' });
    state = apply(state, { type: 'addGoal', title: 'Other' });
    state = apply(state, { type: 'startGoal', id: idOf(state, 'Other') });
    expect(state.rootIds[0]).toBe(idOf(state, 'Other'));
    expect(state.rootIds[state.rootIds.length - 1]).toBe(state.inboxId);
  });
});

describe('backlog migration', () => {
  it('renames a legacy "Inbox" root to "Backlog" on import', () => {
    let state = apply(buildJourney(), { type: 'capture', title: 'x' });
    // Simulate old data by forcing the title back to Inbox.
    const legacy = {
      ...state,
      tasks: {
        ...state.tasks,
        [state.inboxId!]: { ...state.tasks[state.inboxId!], title: 'Inbox' },
      },
    };
    const imported = apply(emptyState, { type: 'import', state: legacy });
    expect(imported.tasks[imported.inboxId!].title).toBe('Backlog');
  });
});

describe('planning edits', () => {
  it('reopening a task reopens its done ancestors', () => {
    let state = buildJourney();
    state = apply(
      state,
      { type: 'done', id: idOf(state, 'Open endpoint file') },
      { type: 'done', id: idOf(state, 'Add parameter') },
      { type: 'done', id: idOf(state, 'Implement backend') },
    );
    state = apply(state, {
      type: 'setStatus',
      id: idOf(state, 'Add parameter'),
      status: 'todo',
    });
    expect(state.tasks[idOf(state, 'Implement backend')].status).toBe('todo');
    expect(findCurrent(state)).toBe(idOf(state, 'Add parameter'));
  });

  it('remove deletes the whole branch and cleans history', () => {
    let state = buildJourney();
    state = apply(state, { type: 'done', id: idOf(state, 'Open endpoint file') });
    state = apply(state, { type: 'remove', id: idOf(state, 'Implement backend') });
    expect(Object.keys(state.tasks)).toHaveLength(2);
    expect(state.history).toHaveLength(0);
    expect(findCurrent(state)).toBe(idOf(state, 'Implement frontend'));
  });

  it('goalOf climbs to the root', () => {
    const state = buildJourney();
    const leaf = idOf(state, 'Open endpoint file');
    expect(goalOf(state, leaf).title).toBe('BigW Ticket');
  });
});

describe('remainingSteps', () => {
  it('counts actionable leaves, not branches', () => {
    const state = buildJourney();
    // Open endpoint file, Add parameter, Implement frontend
    expect(remainingSteps(state, idOf(state, 'BigW Ticket'))).toBe(3);
    expect(remainingSteps(state, idOf(state, 'Implement backend'))).toBe(2);
  });

  it('reaches 1 on the last remaining step of a branch', () => {
    let state = buildJourney();
    state = apply(state, { type: 'done', id: idOf(state, 'Open endpoint file') });
    expect(remainingSteps(state, idOf(state, 'Implement backend'))).toBe(1);
    expect(remainingSteps(state, idOf(state, 'BigW Ticket'))).toBe(2);
    state = apply(state, { type: 'done', id: idOf(state, 'Add parameter') });
    // The parent itself still needs confirmation, so it counts as one step.
    expect(remainingSteps(state, idOf(state, 'Implement backend'))).toBe(1);
    state = apply(state, { type: 'done', id: idOf(state, 'Implement backend') });
    expect(remainingSteps(state, idOf(state, 'Implement backend'))).toBe(0);
    expect(remainingSteps(state, idOf(state, 'BigW Ticket'))).toBe(1);
  });
});

describe('ancestors', () => {
  it('returns the full lineage goal-first, excluding the task itself', () => {
    const state = buildJourney();
    const deep = idOf(state, 'Open endpoint file');
    expect(ancestors(state, deep).map((a) => a.title)).toEqual([
      'BigW Ticket',
      'Implement backend',
    ]);
  });

  it('is empty for a top-level goal', () => {
    const state = buildJourney();
    expect(ancestors(state, idOf(state, 'BigW Ticket'))).toEqual([]);
  });
});

describe('doNow', () => {
  it('inserts a task just ahead of the current one and lands on it', () => {
    const state = buildJourney();
    // Current is the deepest first step.
    expect(findCurrent(state)).toBe(idOf(state, 'Open endpoint file'));
    const next = apply(state, { type: 'doNow', title: 'grab a coffee first' });
    expect(findCurrent(next)).toBe(idOf(next, 'grab a coffee first'));
    // It sits under the same parent as the task it jumped ahead of.
    const inserted = next.tasks[idOf(next, 'grab a coffee first')];
    expect(inserted.parentId).toBe(idOf(next, 'Implement backend'));
    // Finishing it flows back to what we were doing.
    const after = apply(next, { type: 'done', id: inserted.id });
    expect(findCurrent(after)).toBe(idOf(after, 'Open endpoint file'));
  });

  it('with nothing current, becomes a goal at the front', () => {
    const next = apply(emptyState, { type: 'doNow', title: 'just start something' });
    expect(findCurrent(next)).toBe(idOf(next, 'just start something'));
    expect(next.tasks[next.rootIds[0]].title).toBe('just start something');
  });
});

describe('answer', () => {
  it('completes a question-task and keeps the answer', () => {
    let state = apply(emptyState, { type: 'addGoal', title: 'do pothos need drainage?' });
    const id = idOf(state, 'do pothos need drainage?');
    state = apply(state, { type: 'answer', id, text: 'yes — or they root-rot' });
    expect(state.tasks[id].status).toBe('done');
    expect(state.tasks[id].answer).toBe('yes — or they root-rot');
    expect(state.tasks[id].completedAt).not.toBeNull();
  });

  it('is undoable back to todo', () => {
    let state = apply(emptyState, { type: 'addGoal', title: 'ship it?' });
    const id = idOf(state, 'ship it?');
    state = apply(state, { type: 'answer', id, text: 'not yet' });
    state = apply(state, { type: 'undo' });
    expect(state.tasks[id].status).toBe('todo');
  });
});
