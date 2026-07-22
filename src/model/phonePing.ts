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
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body: string;
}

export interface PingOptions {
  // ntfy-only: 'min' delivers without alerting — state updates meant for
  // the home-screen widget, not for the human's attention.
  priority?: 'min' | 'default';
  tags?: string;
}

export function buildPing(
  topicOrUrl: string,
  title: string,
  message: string,
  opts: PingOptions = {},
): PingRequest {
  const url = pingUrl(topicOrUrl);
  const text = `☾ ${title}\n${message}`;
  if (/hooks\.slack\.com/i.test(url)) {
    // No Content-Type on purpose: Slack parses the raw body, and a
    // "simple" request avoids a CORS preflight in the browser fallback.
    return { url, kind: 'slack', method: 'POST', headers: {}, body: JSON.stringify({ text }) };
  }
  if (/discord(app)?\.com\/api\/webhooks/i.test(url)) {
    return {
      url,
      kind: 'discord',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    };
  }
  if (/webhook\.office\.com|logic\.azure\.com/i.test(url)) {
    return {
      url,
      kind: 'teams',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    };
  }
  // ntfy: publish via GET query params — the exact request shape that
  // works from a plain browser URL bar, which proxies that block POST
  // "uploads" to uncategorized sites still allow.
  let publish =
    `${url.replace(/\/$/, '')}/publish?message=${encodeURIComponent(message)}` +
    `&title=${encodeURIComponent(title)}` +
    `&tags=${encodeURIComponent(opts.tags ?? 'crescent_moon')}`;
  if (opts.priority && opts.priority !== 'default') {
    publish += `&priority=${opts.priority}`;
  }
  return { url: publish, kind: 'ntfy', method: 'GET', headers: {}, body: '' };
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

export interface PingResult {
  ok: boolean;
  status: number;
  snippet: string;
}

export async function sendParkPingDetailed(
  topic: string,
  nextStep: string,
  note: string,
): Promise<PingResult> {
  const message = note ? `Next: ${nextStep}\n“${note}”` : `Next: ${nextStep}`;
  return sendPing(buildPing(topic, 'Parked', message));
}

// Silent state update on resume, so a widget polling the topic can show
// "in session" instead of a stale parked step. min priority: no alert —
// it never appears as a notification, only in the topic's message log.
export async function sendResumePing(topic: string, nextStep: string): Promise<PingResult> {
  return withAuthRetry(topic, () =>
    sendPing(
      buildPing(topic, 'In session', `Working on: ${nextStep}`, {
        priority: 'min',
        tags: 'green_circle',
      }),
    ),
  );
}

// Shared auto-reauth: when a corporate filter answers with its sign-in
// page and we're in the desktop app, open the sign-in window (usually
// auto-completes and closes itself), then retry once.
async function withAuthRetry(
  topic: string,
  attempt: () => Promise<PingResult>,
): Promise<PingResult> {
  let result = await attempt();
  const native =
    typeof window !== 'undefined' ? window.taskerNative : undefined;
  if (!result.ok && native?.openAuth && looksLikeAuthPage(result)) {
    try {
      const origin = new URL(pingUrl(topic)).origin;
      const authed = await native.openAuth(origin);
      if (authed) result = await attempt();
    } catch {
      // Keep the original failure result.
    }
  }
  return result;
}

async function sendPing(ping: PingRequest): Promise<PingResult> {
  // Preferred: the Electron main process — Chromium's network stack, no
  // CORS preflight, closest to what "the browser works" proves out.
  const native =
    typeof window !== 'undefined' ? window.taskerNative : undefined;
  if (native?.ping) {
    try {
      const result = await native.ping(ping.url, {
        method: ping.method,
        headers: ping.headers,
        body: ping.body,
      });
      return {
        ok: confirmed(ping.kind, result.status, result.body),
        status: result.status,
        snippet: result.body.replace(/\s+/g, ' ').slice(0, 140),
      };
    } catch (err) {
      return { ok: false, status: 0, snippet: String(err).slice(0, 140) };
    }
  }

  // Browser/PWA fallback.
  try {
    if (ping.kind === 'slack') {
      // Slack webhooks send no CORS headers, so the response is unreadable
      // from a page; no-cors delivers the request but can't be verified.
      await fetch(ping.url, { method: 'POST', mode: 'no-cors', body: ping.body });
      return { ok: true, status: 0, snippet: 'sent (unverifiable from a browser)' };
    }
    const response = await fetch(ping.url, {
      method: ping.method,
      headers: ping.headers,
      body: ping.method === 'POST' ? ping.body : undefined,
    });
    const body = await response.text();
    return {
      ok: confirmed(ping.kind, response.status, body),
      status: response.status,
      snippet: body.replace(/\s+/g, ' ').slice(0, 140),
    };
  } catch (err) {
    return { ok: false, status: 0, snippet: String(err).slice(0, 140) };
  }
}

export async function sendParkPing(
  topic: string,
  nextStep: string,
  note: string,
): Promise<boolean> {
  return (await sendParkPingDetailed(topic, nextStep, note)).ok;
}

// Heuristic: the failed "response" is a filter's sign-in page rather than
// a real error (Zscaler et al. answer with their own HTML, often HTTP 200).
export function looksLikeAuthPage(result: PingResult): boolean {
  return (
    !result.ok &&
    /<html|<!doctype|sign[ -]?in|log[ -]?in|authenticat|zscaler/i.test(result.snippet)
  );
}

// Park ping with automatic re-authentication (see withAuthRetry).
export async function sendParkPingSmart(
  topic: string,
  nextStep: string,
  note: string,
): Promise<PingResult> {
  return withAuthRetry(topic, () => sendParkPingDetailed(topic, nextStep, note));
}
