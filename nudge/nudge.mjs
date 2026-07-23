#!/usr/bin/env node
// nudge — a small standalone accountability nudger that runs BESIDE tasker.
//
// Why it lives outside the app: the thing worth catching is the stretch where
// tasker is closed and staying closed. A feature inside tasker can only run
// when tasker is open, so it is blind to exactly that. This has its own
// heartbeat (launchd) and reaches the phone over ntfy — the same channel
// tasker's park pings already use.
//
// It fires at most twice a day, at your real decision points:
//   • morning  → "In today?"  (the office decision — your inverted signal:
//                 the busier it feels, the more that feeling IS the reason)
//   • night    → "Winding down?" (the stay-up / 3am / finish-everything urge)
//
// It is built around one problem: not being ignored. The defences —
//   1. Ask, don't tell   — one-tap ✓/✗, an act you can't do on autopilot.
//   2. Quieter when ignored, not louder — softens the more you skip it, so
//      it stops chasing (you can't avoid something that isn't chasing you).
//   3. Silent when you're fine — earns each ping; goes quiet on a good run.
//   4. Vary everything — rotates your lines, jitters the minute.
//   5. Observe, never nag — states facts, never scolds.
//
// No dependencies. Node 22+ (global fetch). Reads config.json + state.json
// sitting next to this file. Runtime data (state.json, config.json) is
// gitignored — your topics and answers stay on your machine.
//
// Usage:
//   node nudge.mjs               normal tick (poll taps, maybe nudge)
//   node nudge.mjs --dry-run     print what it WOULD send, send nothing
//   node nudge.mjs --force morning|night   send that nudge now (for testing)
//   node nudge.mjs --poll-only   just read taps, never nudge

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(HERE, 'config.json');
const STATE_PATH = join(HERE, 'state.json');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const POLL_ONLY = args.includes('--poll-only');
const FORCE = args.includes('--force') ? args[args.indexOf('--force') + 1] : null;

function log(msg) {
  console.log(`[nudge ${new Date().toISOString()}] ${msg}`);
}

// ---- config + state -------------------------------------------------------

if (!existsSync(CONFIG_PATH)) {
  log(`no config.json found. Copy config.example.json → config.json and edit it.`);
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

function freshSide() {
  return { lastNudgeDate: null, ignored: 0, goodStreak: 0, consecutiveOut: 0, quietUntil: null, answers: {} };
}
function loadState() {
  if (!existsSync(STATE_PATH)) {
    return { tapsSince: null, morning: freshSide(), night: freshSide(), backstop: { lastSentDate: null }, lastLine: {} };
  }
  const s = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  s.morning ??= freshSide();
  s.night ??= freshSide();
  s.backstop ??= { lastSentDate: null };
  s.lastLine ??= {};
  return s;
}
function saveState(s) {
  if (DRY) return;
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

// ---- dates / time ---------------------------------------------------------

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return localDate(dt);
}
function minutesNow(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}
function parseHHMM(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}
function inWindow(w) {
  const now = minutesNow();
  return now >= parseHHMM(w.start) && now <= parseHHMM(w.end);
}
function currentWindowType() {
  if (cfg.windows.morning && inWindow(cfg.windows.morning)) return 'morning';
  if (cfg.windows.night && inWindow(cfg.windows.night)) return 'night';
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (n) => Math.floor(Math.random() * n);

// ---- reading taps back (your ✓/✗ answers) --------------------------------

// The notification's ✓/✗ buttons POST a tiny message ("office:in") to a
// second, private "taps" topic. We poll that topic and let your answers
// steer tomorrow: engaged → normal; ignored → softer; good run → silent.
async function pollTaps(state) {
  const since = state.tapsSince ?? Math.floor(Date.now() / 1000) - 43200; // 12h back on first run
  const url = `${cfg.server.replace(/\/$/, '')}/${cfg.tapsTopic}/json?poll=1&since=${since}`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    log(`taps poll failed (network): ${e.message}`);
    return;
  }
  if (!res.ok) {
    log(`taps poll HTTP ${res.status}`);
    return;
  }
  const text = await res.text();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.event !== 'message' || !ev.message) continue;
    applyTap(state, ev.message, localDate(new Date((ev.time ?? Date.now() / 1000) * 1000)));
  }
  state.tapsSince = Math.floor(Date.now() / 1000);
}

function applyTap(state, message, day) {
  const [type, val] = String(message).trim().split(':');
  const side = state[type];
  if (!side || (type !== 'morning' && type !== 'night')) return;
  side.ignored = 0; // you engaged — back to a normal, un-softened nudge
  side.answers[day] = val;
  const good = type === 'morning' ? 'in' : 'stop';
  const bad = type === 'morning' ? 'out' : 'push';
  if (val === good) {
    side.goodStreak = (side.goodStreak || 0) + 1;
    side.consecutiveOut = 0;
    if (side.goodStreak >= (cfg.silenceAfterGood ?? 3)) {
      side.quietUntil = addDays(localDate(), cfg.silenceDays ?? 2); // earned silence
      side.goodStreak = 0;
      log(`${type}: good run — going quiet until ${side.quietUntil}`);
    }
  } else if (val === bad) {
    side.goodStreak = 0;
    side.quietUntil = null; // live signal — re-engage
    side.consecutiveOut = (side.consecutiveOut || 0) + 1;
  }
  log(`tap: ${type} = ${val}`);
}

// ---- choosing what to say -------------------------------------------------

// Softening ladder: the more consecutive nudges you ignore, the lower the
// level, the fewer the words, the gentler the ask. Level 3 also backs off
// the frequency. Answering anything resets you to level 0.
function chooseLines(type, level, consecutiveOut) {
  const sets = cfg.lines[type];
  // When you've actively said "out" a couple of days running, the morning
  // note names that fact plainly (observe, don't nag) instead of escalating.
  if (type === 'morning' && consecutiveOut >= 2 && level <= 1 && sets.streakOut?.length) {
    return sets.streakOut;
  }
  return sets[`level${level}`] ?? sets.level0;
}

function pickLine(state, type, level, consecutiveOut) {
  const pool = chooseLines(type, level, consecutiveOut);
  const lastIdx = state.lastLine[type];
  let idx = rand(pool.length);
  if (pool.length > 1 && idx === lastIdx) idx = (idx + 1) % pool.length; // no immediate repeat
  state.lastLine[type] = idx;
  return pool[idx];
}

// ---- sending --------------------------------------------------------------

function actionsFor(type) {
  const post = (body) => ({
    action: 'http',
    label: undefined,
    url: `${cfg.server.replace(/\/$/, '')}/${cfg.tapsTopic}`,
    method: 'POST',
    body,
    clear: true,
  });
  if (type === 'morning') {
    return [
      { ...post('morning:in'), label: 'In ✓' },
      { ...post('morning:out'), label: 'Not today ✗' },
    ];
  }
  return [
    { ...post('night:stop'), label: 'Calling it ✓' },
    { ...post('night:push'), label: 'Pushing on ✗' },
  ];
}

async function send(type, message) {
  const title = type === 'morning' ? 'Office?' : 'Winding down?';
  const tags = type === 'morning' ? ['sunrise'] : ['crescent_moon'];
  const payload = { topic: cfg.topic, title, message, tags, actions: actionsFor(type) };
  if (DRY) {
    log(`DRY-RUN would send (${type}):`);
    console.log(JSON.stringify(payload, null, 2));
    return true;
  }
  // Small jitter so it never lands at the same minute two days running.
  const jitter = FORCE ? 0 : rand((cfg.jitterMinutes ?? 0) + 1);
  if (jitter) {
    log(`jittering ${jitter} min before send`);
    await sleep(jitter * 60000);
  }
  let res;
  try {
    res = await fetch(cfg.server, { method: 'POST', body: JSON.stringify(payload) });
  } catch (e) {
    log(`send failed (network): ${e.message}`);
    return false;
  }
  const body = await res.text();
  let delivered = false;
  try {
    delivered = res.ok && typeof JSON.parse(body).id === 'string';
  } catch {
    delivered = false;
  }
  if (!delivered) log(`send not confirmed: HTTP ${res.status} — ${body.slice(0, 120)}`);
  else log(`sent ${type}: "${message}"`);
  return delivered;
}

// ---- optional: the late backstop (reads tasker's autosave file) -----------

// Off by default. If you point it at tasker's on-disk autosave file, it will
// notice when nothing has been *finished* in a while — the latest, crudest
// signal, a safety net under the two early nudges.
async function backstopCheck(state) {
  const b = cfg.completionBackstop;
  if (!b?.enabled) return;
  const today = localDate();
  if (state.backstop.lastSentDate === today) return;
  if (!existsSync(b.taskerFile)) {
    log(`backstop: tasker file not found at ${b.taskerFile}`);
    return;
  }
  let data;
  try {
    data = JSON.parse(readFileSync(b.taskerFile, 'utf8'));
  } catch (e) {
    log(`backstop: could not read tasker file: ${e.message}`);
    return;
  }
  const tasks = data.tasks ? Object.values(data.tasks) : [];
  let last = 0;
  for (const t of tasks) if (t.completedAt && t.completedAt > last) last = t.completedAt;
  if (!last) return;
  const days = Math.floor((Date.now() - last) / 86400000);
  if (days < (b.staleDays ?? 4)) return;
  const message = `Nothing closed in ${days} days. Not a verdict — just a fact. Pick one small thing for tomorrow?`;
  if (DRY) {
    log(`DRY-RUN backstop would send: ${message}`);
  } else {
    const payload = { topic: cfg.topic, title: 'Still there?', message, tags: ['seedling'] };
    try {
      await fetch(cfg.server, { method: 'POST', body: JSON.stringify(payload) });
      log(`sent backstop (${days} days stale)`);
    } catch (e) {
      log(`backstop send failed: ${e.message}`);
    }
  }
  state.backstop.lastSentDate = today;
}

// ---- main -----------------------------------------------------------------

async function main() {
  const state = loadState();
  await pollTaps(state); // always read your answers first
  await backstopCheck(state);

  if (POLL_ONLY) {
    saveState(state);
    return;
  }

  const type = FORCE || currentWindowType();
  if (!type) {
    saveState(state);
    return; // outside both windows — nothing to say
  }
  const side = state[type];
  const today = localDate();

  if (!FORCE) {
    if (side.lastNudgeDate === today) {
      saveState(state);
      return; // already nudged for this window today
    }
    if (side.quietUntil && today <= side.quietUntil) {
      saveState(state);
      return; // earned silence — you're on a good run
    }
  }

  const level = Math.min(side.ignored || 0, 3);
  if (level >= 3 && !FORCE && Math.random() < 0.5) {
    // Backing off: at this point it stops chasing you.
    saveState(state);
    return;
  }

  const message = pickLine(state, type, level, side.consecutiveOut || 0);
  const ok = await send(type, message);

  if (!FORCE && ok) {
    side.lastNudgeDate = today;
    // Assume ignored until a tap proves otherwise; a tap resets this to 0.
    side.ignored = (side.ignored || 0) + 1;
  }
  saveState(state);
}

main().catch((e) => {
  log(`fatal: ${e.stack || e.message}`);
  process.exit(1);
});
