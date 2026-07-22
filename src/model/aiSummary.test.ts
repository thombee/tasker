import { describe, expect, it } from 'vitest';
import { buildSummaryMessages, DEFAULT_MODEL } from './aiSummary';

describe('buildSummaryMessages', () => {
  it('sends a system instruction plus the raw day text', () => {
    const msgs = buildSummaryMessages('Today — what I did:\n• BigW Ticket: Open file');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toMatch(/bullet/i);
    expect(msgs[1].role).toBe('user');
    expect(msgs[1].content).toContain('BigW Ticket');
  });

  it('has a sensible default model', () => {
    expect(DEFAULT_MODEL).toContain('llama');
  });
});
