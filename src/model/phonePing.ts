// Optional one-way "parked" pings to the user's phone via ntfy
// (https://ntfy.sh): parking POSTs the next step to a secret topic the
// user subscribes to in the ntfy app. Read-only broadcast — no sync.

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
// (for a self-hosted ntfy server).
export function pingUrl(topicOrUrl: string): string {
  const value = topicOrUrl.trim();
  if (/^https?:\/\//i.test(value)) return value;
  return `https://ntfy.sh/${encodeURIComponent(value)}`;
}

export function sendParkPing(
  topic: string,
  nextStep: string,
  note: string,
): Promise<boolean> {
  const body = note ? `Next: ${nextStep}\n“${note}”` : `Next: ${nextStep}`;
  return fetch(pingUrl(topic), {
    method: 'POST',
    body,
    headers: { Title: 'Parked', Tags: 'crescent_moon' },
  })
    .then((response) => response.ok)
    .catch(() => false);
}
