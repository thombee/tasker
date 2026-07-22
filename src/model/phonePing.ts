// Optional one-way "parked" pings to the user's phone. The destination
// field accepts an ntfy topic (https://ntfy.sh — free push notifications),
// a full self-hosted ntfy URL, or a Slack / Teams / Discord webhook URL
// for networks where ntfy is unreachable. Read-only broadcast — no sync.

const KEY = 'tasker.ntfy.topic';

export function getPhoneTopic(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePhoneTopic(topic: string): void {
  try {
    const trimmed = topic.trim();
    if (trimmed) localStorage.setItem(KEY, trimmed);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable — the ping just won't persist a topic.
  }
}

// Accepts either a bare topic name (delivered via ntfy.sh) or a full URL
// (self-hosted ntfy, or a webhook).
export function pingUrl(topicOrUrl: string): string {
  const value = topicOrUrl.trim();
  if (/^https?:\/\//i.test(value)) return value;
  return `https://ntfy.sh/${encodeURIComponent(value)}`;
}

export type PingKind = 'ntfy' | 'slack' | 'teams' | 'discord';

export interface PingRequest {
  url: string;
  kind: PingKind;
  headers: Record<string, string>;
  body: string;
}

export function buildPing(
  topicOrUrl: string,
  title: string,
  message: string,
): PingRequest {
  const url = pingUrl(topicOrUrl);
  const text = `☾ ${title}\n${message}`;
  if (/hooks\.slack\.com/i.test(url)) {
    // No Content-Type on purpose: Slack parses the raw body, and a
    // "simple" request avoids a CORS preflight in the browser fallback.
    return { url, kind: 'slack', headers: {}, body: JSON.stringify({ text }) };
  }
  if (/discord(app)?\.com\/api\/webhooks/i.test(url)) {
    return {
      url,
      kind: 'discord',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    };
  }
  if (/webhook\.office\.com|logic\.azure\.com/i.test(url)) {
    return {
      url,
      kind: 'teams',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    };
  }
  return {
    url,
    kind: 'ntfy',
    headers: { Title: title, Tags: 'crescent_moon' },
    body: message,
  };
}

function confirmed(kind: PingKind, status: number, body: string): boolean {
  if (status < 200 || status >= 300) return false;
  if (kind === 'ntfy') {
    // A 200 alone can be a lying intermediary (corporate proxies answer
    // with their own 200 block pages). Real ntfy echoes the message back
    // with an id — only that counts as delivered.
    try {
      const data = JSON.parse(body);
      return typeof data.id === 'string' && data.id.length > 0;
    } catch {
      return false;
    }
  }
  if (kind === 'slack') return body.trim() === 'ok';
  return true;
}

export async function sendParkPing(
  topic: string,
  nextStep: string,
  note: string,
): Promise<boolean> {
  const message = note ? `Next: ${nextStep}\n“${note}”` : `Next: ${nextStep}`;
  const ping = buildPing(topic, 'Parked', message);

  // Preferred: the Electron main process — Chromium's network stack, no
  // CORS preflight, closest to what "the browser works" proves out.
  const native =
    typeof window !== 'undefined' ? window.taskerNative : undefined;
  if (native?.ping) {
    try {
      const result = await native.ping(ping.url, {
        headers: ping.headers,
        body: ping.body,
      });
      return confirmed(ping.kind, result.status, result.body);
    } catch {
      return false;
    }
  }

  // Browser/PWA fallback.
  try {
    if (ping.kind === 'slack') {
      // Slack webhooks send no CORS headers, so the response is unreadable
      // from a page; no-cors delivers the request but can't be verified.
      await fetch(ping.url, { method: 'POST', mode: 'no-cors', body: ping.body });
      return true;
    }
    const response = await fetch(ping.url, {
      method: 'POST',
      headers: ping.headers,
      body: ping.body,
    });
    return confirmed(ping.kind, response.status, await response.text());
  } catch {
    return false;
  }
}
