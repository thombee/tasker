import { describe, expect, it } from 'vitest';
import { buildPing, pingUrl } from './phonePing';

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

describe('buildPing', () => {
  it('publishes ntfy topics via GET query params — no body, no custom headers', () => {
    const ping = buildPing('my-topic', 'Parked', 'Next: Open file');
    expect(ping.kind).toBe('ntfy');
    expect(ping.method).toBe('GET');
    expect(ping.url).toBe(
      'https://ntfy.sh/my-topic/publish?message=Next%3A%20Open%20file&title=Parked&tags=crescent_moon',
    );
    expect(ping.body).toBe('');
    expect(ping.headers).toEqual({});
  });

  it('formats Slack webhooks as {text} JSON without a content type', () => {
    const ping = buildPing(
      'https://hooks.slack.com/services/T00/B00/xyz',
      'Parked',
      'Next: Open file',
    );
    expect(ping.kind).toBe('slack');
    expect(JSON.parse(ping.body).text).toContain('Next: Open file');
    expect(ping.headers['Content-Type']).toBeUndefined();
  });

  it('formats Teams workflow URLs as {text} JSON', () => {
    const ping = buildPing(
      'https://prod-01.westus.logic.azure.com/workflows/abc/triggers/manual/paths/invoke',
      'Parked',
      'Next: Open file',
    );
    expect(ping.kind).toBe('teams');
    expect(JSON.parse(ping.body).text).toContain('Next: Open file');
  });

  it('formats Discord webhooks as {content} JSON', () => {
    const ping = buildPing(
      'https://discord.com/api/webhooks/123/token',
      'Parked',
      'Next: Open file',
    );
    expect(ping.kind).toBe('discord');
    expect(JSON.parse(ping.body).content).toContain('Next: Open file');
  });

  it('treats self-hosted ntfy URLs as ntfy and appends the publish path', () => {
    const ping = buildPing('https://ntfy.example.com/secret', 'Parked', 'x');
    expect(ping.kind).toBe('ntfy');
    expect(ping.method).toBe('GET');
    expect(ping.url).toBe(
      'https://ntfy.example.com/secret/publish?message=x&title=Parked&tags=crescent_moon',
    );
  });
});
