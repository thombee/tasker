import { describe, expect, it } from 'vitest';
import {
  emptySpaces,
  sanitizeSpaces,
  Spaces,
  TopAction,
  topReducer,
} from './store';
import { findCurrent } from './traversal';

function apply(spaces: Spaces, ...actions: TopAction[]): Spaces {
  return actions.reduce(topReducer, spaces);
}

function idIn(state: { tasks: Record<string, { title: string }> }, title: string): string {
  const id = Object.keys(state.tasks).find((k) => state.tasks[k].title === title);
  if (!id) throw new Error(`no task ${title}`);
  return id;
}

describe('spaces', () => {
  it('routes actions to the active space and keeps the other untouched', () => {
    let spaces = apply(emptySpaces, { type: 'addGoal', title: 'Work goal' });
    expect(Object.values(spaces.work.tasks)).toHaveLength(1);
    expect(Object.values(spaces.life.tasks)).toHaveLength(0);

    spaces = apply(spaces, { type: 'switchSpace', space: 'life' });
    spaces = apply(spaces, { type: 'addGoal', title: 'Life goal' });
    expect(Object.values(spaces.life.tasks)).toHaveLength(1);
    // Work is still exactly as it was.
    expect(Object.values(spaces.work.tasks)).toHaveLength(1);
    expect(spaces.work.rootIds).toHaveLength(1);
  });

  it('switchSpace changes which state findCurrent sees', () => {
    let spaces = apply(emptySpaces, { type: 'addGoal', title: 'Work goal' });
    const wGoal = idIn(spaces.work, 'Work goal');
    spaces = apply(spaces, { type: 'breakDown', id: wGoal, titles: ['work step'] });
    spaces = apply(spaces, { type: 'switchSpace', space: 'life' });
    spaces = apply(spaces, { type: 'addGoal', title: 'Life goal' });
    const lGoal = idIn(spaces.life, 'Life goal');
    spaces = apply(spaces, { type: 'breakDown', id: lGoal, titles: ['life step'] });

    // Active = life → current is the life step.
    expect(findCurrent(spaces[spaces.active])).toBe(idIn(spaces.life, 'life step'));
    spaces = apply(spaces, { type: 'switchSpace', space: 'work' });
    expect(findCurrent(spaces[spaces.active])).toBe(idIn(spaces.work, 'work step'));
  });

  it('moveGoalToSpace moves a whole subtree to the other space', () => {
    let spaces = apply(emptySpaces, { type: 'addGoal', title: 'Plant' });
    const plant = idIn(spaces.work, 'Plant');
    spaces = apply(spaces, {
      type: 'breakDown',
      id: plant,
      titles: ['buy pot', 'find light'],
    });
    // Move Plant from Work → Life.
    spaces = apply(spaces, { type: 'moveGoalToSpace', id: plant, to: 'life' });
    expect(spaces.work.rootIds).not.toContain(plant);
    expect(spaces.life.rootIds).toContain(plant);
    // The children came along.
    expect(Object.values(spaces.life.tasks).map((t) => t.title).sort()).toEqual([
      'Plant',
      'buy pot',
      'find light',
    ]);
    expect(Object.keys(spaces.work.tasks)).toHaveLength(0);
  });

  it('moveGoalToSpace keeps the destination Backlog last', () => {
    let spaces = apply(emptySpaces, { type: 'addGoal', title: 'A' });
    // seed a backlog in life
    spaces = apply(spaces, { type: 'switchSpace', space: 'life' });
    spaces = apply(spaces, { type: 'capture', title: 'stray' });
    spaces = apply(spaces, { type: 'switchSpace', space: 'work' });
    const a = idIn(spaces.work, 'A');
    spaces = apply(spaces, { type: 'moveGoalToSpace', id: a, to: 'life' });
    expect(spaces.life.rootIds[spaces.life.rootIds.length - 1]).toBe(spaces.life.inboxId);
    expect(spaces.life.rootIds).toContain(a);
  });

  it('sanitizeSpaces coerces junk to empty and defaults active to work', () => {
    const s = sanitizeSpaces({ work: 'nonsense', life: null, active: 'bogus' });
    expect(s.work.rootIds).toEqual([]);
    expect(s.life.rootIds).toEqual([]);
    expect(s.active).toBe('work');
  });
});
