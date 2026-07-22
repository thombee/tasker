// Optional AI summary of a day's completed tasks, via Groq's free
// OpenAI-compatible chat API. Turns raw task titles into readable bullet
// points for a standup or manager update. The key is stored locally; nothing
// is sent unless the user asks for a summary.

const KEY_STORAGE = 'tasker.groq.key';
const MODEL_STORAGE = 'tasker.groq.model';
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

export function getGroqKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function saveGroqKey(key: string): void {
  try {
    const t = key.trim();
    if (t) localStorage.setItem(KEY_STORAGE, t);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // storage unavailable
  }
}

export function getGroqModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function saveGroqModel(model: string): void {
  try {
    const t = model.trim();
    if (t && t !== DEFAULT_MODEL) localStorage.setItem(MODEL_STORAGE, t);
    else localStorage.removeItem(MODEL_STORAGE);
  } catch {
    // storage unavailable
  }
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

// Exported for testing: the exact messages sent for a day summary.
export function buildSummaryMessages(rawText: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You turn a list of completed work tasks into a short, readable set of ' +
        'bullet points for a standup or a manager update. Group related items, ' +
        'use plain professional language, and keep it tight. Output only the ' +
        'bullets, one per line starting with "• ". No preamble, no closing line.',
    },
    { role: 'user', content: rawText },
  ];
}

export interface AiResult {
  ok: boolean;
  text: string;
  status: number;
  error: string;
}

async function chat(messages: ChatMessage[]): Promise<AiResult> {
  const key = getGroqKey();
  if (!key) return { ok: false, text: '', status: 0, error: 'No Groq key set' };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
  const body = JSON.stringify({
    model: getGroqModel(),
    messages,
    temperature: 0.3,
    max_tokens: 500,
  });

  try {
    let status: number;
    let respBody: string;
    // Prefer the desktop app's main process (no CORS, handles work proxies).
    const native = typeof window !== 'undefined' ? window.taskerNative : undefined;
    if (native?.apiCall) {
      const r = await native.apiCall(ENDPOINT, { headers, body });
      status = r.status;
      respBody = r.body;
    } else {
      const resp = await fetch(ENDPOINT, { method: 'POST', headers, body });
      status = resp.status;
      respBody = await resp.text();
    }

    if (status < 200 || status >= 300) {
      let msg = respBody.slice(0, 200);
      try {
        msg = JSON.parse(respBody).error?.message ?? msg;
      } catch {
        // keep the raw snippet
      }
      return { ok: false, text: '', status, error: msg || `HTTP ${status}` };
    }

    const data = JSON.parse(respBody);
    const text = (data.choices?.[0]?.message?.content ?? '').trim();
    return { ok: !!text, text, status, error: text ? '' : 'Empty response' };
  } catch (err) {
    return { ok: false, text: '', status: 0, error: String(err).slice(0, 200) };
  }
}

export function summarizeDay(rawText: string): Promise<AiResult> {
  return chat(buildSummaryMessages(rawText));
}

export function testGroq(): Promise<AiResult> {
  return chat([{ role: 'user', content: 'Reply with the single word: ready' }]);
}
