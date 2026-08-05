// Gentle "reset companion" settings. The philosophy: when you've stalled,
// the fix isn't a bark to get back to work — it's *permission* to centre
// yourself (tidy something, breathe, step outside) without feeling rushed,
// because a settled brain does the rest. So check-ins only fire when you've
// gone quiet, and they always offer a real reset as a first-class choice.
//
// Stored per device (like the phone topic and Groq key), never in backups.

const ENABLED = 'tasker.checkin.enabled.v1';
const IDLE = 'tasker.checkin.idleMin.v1';
const ACTIVITIES = 'tasker.reset.activities.v1';

export interface CheckinSettings {
  enabled: boolean;
  // Minutes of quiet (nothing finished) before a gentle check-in — and the
  // gap between repeats while you stay quiet.
  idleMin: number;
}

const DEFAULT_IDLE = 20;

export const DEFAULT_RESET_ACTIVITIES = [
  'Tidy one thing',
  'Step outside for a minute',
  'Meditate or just breathe',
  'Drink some water',
  'Stretch',
  'Look out the window',
];

export function getCheckinSettings(): CheckinSettings {
  try {
    const idle = Number(localStorage.getItem(IDLE));
    return {
      enabled: localStorage.getItem(ENABLED) === '1',
      idleMin: Number.isFinite(idle) && idle >= 1 ? idle : DEFAULT_IDLE,
    };
  } catch {
    return { enabled: false, idleMin: DEFAULT_IDLE };
  }
}

export function saveCheckinSettings(s: CheckinSettings): void {
  try {
    localStorage.setItem(ENABLED, s.enabled ? '1' : '0');
    localStorage.setItem(IDLE, String(Math.max(1, Math.round(s.idleMin))));
  } catch {
    // storage unavailable
  }
}

export function getResetActivities(): string[] {
  try {
    const raw = localStorage.getItem(ACTIVITIES);
    if (!raw) return DEFAULT_RESET_ACTIVITIES;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      const clean = arr.filter((a) => typeof a === 'string' && a.trim()).map((a) => a.trim());
      return clean.length ? clean : DEFAULT_RESET_ACTIVITIES;
    }
    return DEFAULT_RESET_ACTIVITIES;
  } catch {
    return DEFAULT_RESET_ACTIVITIES;
  }
}

export function saveResetActivities(list: string[]): void {
  try {
    const clean = list.map((a) => a.trim()).filter(Boolean);
    localStorage.setItem(ACTIVITIES, JSON.stringify(clean));
  } catch {
    // storage unavailable
  }
}

export interface NudgeContext {
  enabled: boolean;
  idleMin: number;
  sinceActivityMs: number; // how long since you last finished/skipped something
  sinceNudgeMs: number; // how long since the last check-in
  hasCurrent: boolean; // there's a task to return to
  parked: boolean; // you've deliberately stepped away
}

// Pure decision: nudge only when you've genuinely gone quiet — never while
// you're actively finishing steps (don't interrupt flow), never when parked,
// and no more than once per idle window.
export function shouldCheckin(ctx: NudgeContext): boolean {
  if (!ctx.enabled || !ctx.hasCurrent || ctx.parked) return false;
  const idleMs = ctx.idleMin * 60000;
  if (ctx.sinceActivityMs < idleMs) return false;
  if (ctx.sinceNudgeMs < idleMs) return false;
  return true;
}
