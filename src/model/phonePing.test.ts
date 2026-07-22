import { describe, expect, it } from 'vitest';
import { pingUrl } from './phonePing';

describe('pingUrl', () => {
  it('turns a bare topic into an ntfy.sh URL', () => {
    expect(pingUrl('tasker-thom-x7k2p9')).toBe('https://ntfy.sh/tasker-thom-x7k2p9');
  });

  it('encodes unsafe characters in topic names', () => {
    expect(pingUrl('my topic/x')).toBe('https://ntfy.sh/my%20topic%2Fx');
  });

  it('passes a full URL through for self-hosted servers', () => {
    expect(pingUrl('https://ntfy.example.com/secret')).toBe(
      'https://ntfy.example.com/secret',
    );
  });

  it('trims whitespace', () => {
    expect(pingUrl('  topic  ')).toBe('https://ntfy.sh/topic');
  });
});
