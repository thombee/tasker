import { describe, expect, it } from 'vitest';
import { emptyState, reducer, Action } from './store';
import { findCurrent, goalOf, remainingSteps } from './traversal';
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

  it('crosses branches when one is finished', () => {
    let state = buildJourney();
    state = apply(
      state,
      { type: 'done', id: idOf(state, 'Open endpoint file') },
      { type: 'done', id: idOf(state, 'Add parameter') },
    );
    expect(findCurrent(state)).toBe(idOf(state, 'Implement frontend'));
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
      { type: 'done', id: idOf(state, 'Implement frontend') },
    );
    expect(findCurrent(state)).toBe(idOf(state, 'SuccessFactors Review'));
  });
});

describe('done cascade', () => {
  it('auto-completes ancestors when the last child finishes', () => {
    let state = buildJourney();
    state = apply(
      state,
      { type: 'done', id: idOf(state, 'Open endpoint file') },
      { type: 'done', id: idOf(state, 'Add parameter') },
    );
    expect(state.tasks[idOf(state, 'Implement backend')].status).toBe('done');
    // Goal itself is not done — frontend remains.
    expect(state.tasks[idOf(state, 'BigW Ticket')].status).toBe('todo');
    state = apply(state, { type: 'done', id: idOf(state, 'Implement frontend') });
    expect(state.tasks[idOf(state, 'BigW Ticket')].status).toBe('done');
  });
});

describe('undo', () => {
  it('reverses a cascaded done in one step', () => {
    let state = buildJourney();
    state = apply(
      state,
      { type: 'done', id: idOf(state, 'Open endpoint file') },
      { type: 'done', id: idOf(state, 'Add parameter') },
    );
    state = apply(state, { type: 'undo' });
    expect(state.tasks[idOf(state, 'Add parameter')].status).toBe('todo');
    expect(state.tasks[idOf(state, 'Implement backend')].status).toBe('todo');
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
  it('creates an Inbox goal on first capture and appends thoughts', () => {
    let state = apply(buildJourney(), { type: 'capture', title: 'Email Sarah back' });
    expect(state.inboxId).toBeTruthy();
    const inbox = state.tasks[state.inboxId!];
    expect(inbox.title).toBe('Inbox');
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

describe('planning edits', () => {
  it('reopening a task reopens its done ancestors', () => {
    let state = buildJourney();
    state = apply(
      state,
      { type: 'done', id: idOf(state, 'Open endpoint file') },
      { type: 'done', id: idOf(state, 'Add parameter') },
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
    expect(remainingSteps(state, idOf(state, 'BigW Ticket'))).toBe(1);
    expect(remainingSteps(state, idOf(state, 'Implement backend'))).toBe(0);
  });
});
