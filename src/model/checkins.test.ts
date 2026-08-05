import { describe, expect, it } from 'vitest';
import { NudgeContext, shouldCheckin } from './checkins';

const base: NudgeContext = {
  enabled: true,
  idleMin: 20,
  sinceActivityMs: 25 * 60000,
  sinceNudgeMs: 60 * 60000,
  hasCurrent: true,
  parked: false,
};

describe('shouldCheckin', () => {
  it('fires when quiet past the idle window with a task to return to', () => {
    expect(shouldCheckin(base)).toBe(true);
  });

  it('never fires while disabled', () => {
    expect(shouldCheckin({ ...base, enabled: false })).toBe(false);
  });

  it('stays silent while you are actively finishing steps', () => {
    // Finished something 3 minutes ago — you're in flow, don't interrupt.
    expect(shouldCheckin({ ...base, sinceActivityMs: 3 * 60000 })).toBe(false);
  });

  it('does not re-nudge within one idle window', () => {
    expect(shouldCheckin({ ...base, sinceNudgeMs: 5 * 60000 })).toBe(false);
  });

  it('does not fire when parked (a deliberate step away)', () => {
    expect(shouldCheckin({ ...base, parked: true })).toBe(false);
  });

  it('does not fire when there is nothing to return to', () => {
    expect(shouldCheckin({ ...base, hasCurrent: false })).toBe(false);
  });
});
