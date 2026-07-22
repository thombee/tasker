# tasker — a microtask-first task manager

Most task managers are project-first: they show you the whole mountain while
you're trying to take one step. tasker is execution-first. It shows exactly
**one** actionable task at a time — like GPS navigation for work. You don't
look at the map; you look at "turn left in 100 metres."

The goal is not better project management. The goal is **reducing activation
energy**: making it as easy as possible to begin.

## Running it locally

```bash
npm install
npm run dev      # opens on http://localhost:5173
```

Everything is stored in your browser's localStorage. No account, no server,
no sync. For durability, **Plan → "Choose a file on disk"** picks a real
file that every change autosaves to (Chrome/Edge — File System Access API),
so a browser cleanup can't take your data with it. Manual **Export/Import
backup** works everywhere as a fallback.

```bash
npm test         # core traversal/undo logic tests
npm run build    # production build in dist/
```

## Running it as a Mac app

The repo ships an Electron wrapper so tasker can be a normal desktop app —
dock icon, own window, launches from Spotlight, no terminal or browser.

On your Mac (**needs Node ≥ 22.12** — Electron 43 and electron-builder
require it; on older Node the build fails with an `ERR_REQUIRE_ESM` crash):

```bash
node -v            # v22+ — if not: brew install node@22 / nvm install 22
npm install
npm run dist:mac   # builds release/tasker-<version>-arm64.dmg
```

Open the `.dmg` from `release/` and drag **tasker** into Applications.
(It's unsigned, so the first launch needs right-click → Open.) For a quick
run without packaging, `npm run app` starts the desktop window directly.

Notes:

- The desktop app has its **own storage** (Electron's user-data directory,
  which nothing but the app touches — no browser-cleanup risk). If you have
  existing data in the browser version, move it across with
  Plan → Export backup in the browser, then Import backup in the app.
- The window title mirrors the current task, same as the browser tab.
- macOS packaging has to run on a Mac; there's no cross-build from
  Linux/CI here. `electron-builder --win` / `--linux` work the same way on
  those platforms.

## How it works

- **Everything is a Task.** Goals, tasks, subtasks — all just nodes in a
  tree. Each node has a title, status, optional notes, and an optional
  estimate. Nothing more.
- **Execution mode** (the default) traverses the tree and always lands on the
  smallest unfinished step. You see one task, four buttons, and the name of
  the goal it belongs to. The hierarchy exists — you just never look at it.
- **Too Big** is the defining feature. If the current task feels too large to
  start, press it and type smaller steps, one per line. The first one
  immediately becomes your current task. Repeat until the step feels easy
  enough to actually do ("Open VSCode" is a perfectly valid task).
- **Done** advances automatically to the next step. No navigation, no
  deciding what comes next.
- **Skip** steps over a task without deleting it; you can restore it later in
  Planning mode.
- **← Previous** undoes the last Done/Skip, in case you tapped too fast.
- **Planning mode** (top-right "Plan" link) is the hidden map: a
  filesystem-like tree where you can add, rename, reorder, delete, annotate,
  and reopen tasks. Execution never looks like planning.

### Today's journey

An optional morning ritual (**Today** in the top nav): pick 1–3 goals to
carry today, and execution walks only those — everything else rests, not
deleted, not overdue, just waiting its turn. A finite, completable day
beats an open-ended one; finishing today's picks shows a real "Today's
journey, done" finish line instead of a treadmill. It's a lens you *can*
put on, never a gate — skip it and every goal stays live, exactly as
before. A quiet, dismissible morning prompt offers it when you have more
than one goal in play; the filter auto-expires at the end of its day.

### Context helpers

Hiding the hierarchy costs you context, so execution mode has four small
tools for externalized working memory:

- **Goal scratchpad** (`n` or the "notes" link): a free-text notes panel
  scoped to the current *goal*, editable without leaving the current task.
  Where things are, decisions made, where you left off.
- **Quick capture** (`c` or "+ capture"): a one-line input for stray
  thoughts ("reply to that email"). Enter files it into a **Backlog** goal
  at the end of your journey; **shift-Enter files it as an upcoming step
  of the goal you're inside** — for research tangents that belong right
  here ("do pothos need drainage holes?"). Either way you stay on the
  current task. In the desktop app, a global hotkey
  (**Cmd/Ctrl+Shift+K**) brings the window forward and opens capture from
  anywhere, so an interrupting thought never derails you.
- **"part of" line**: the current task shows its immediate parent when
  that adds context beyond the goal name — the one deliberate hierarchy leak.
- **Recent trail**: your last three finished steps, so re-entry after a
  break means rereading your own momentum instead of reconstructing it.

- **Switch goal** (`g` or "switch goal →", shown when another goal has
  work left): moves on to the next goal *without skipping anything* — the
  current goal just rotates to the back of the journey and will come
  around again.
- **Park** ("park ☾" in the footer): a closing ritual for stepping away.
  It shows you your exact next step, takes an optional one-line breadcrumb,
  and rests on a calm screen — "when you come back, it's just: *open the
  file*. It's written down; you don't have to carry it." Research on goal
  rumination shows unfinished work stops intruding on your thoughts once a
  specific next step is externalized — parking makes the *microtask* your
  exit-memory instead of the whole scary goal. Doing anything (Done/Skip)
  or pressing "I'm back" resumes.

Keyboard shortcuts in execution mode: `d`/`Enter` done · `b` break down ·
`s` skip · `z` previous · `n` notes · `c` capture · `g` switch goal.

### AI summary (optional, free)

Each day in the Journal has a **✨ summarize** action that rewrites your
finished tasks into tidy standup-ready bullet points. It uses
[Groq](https://console.groq.com/keys), which is free: make a key, paste it
into **Plan → AI summary**, and hit Test. Nothing is ever sent unless you
click summarize; the key is stored locally and (in the desktop app) the
call routes through the main process, so it works behind corporate proxies.
Your task titles pass through Groq's servers, so keep them non-sensitive.

### Journal

The **Journal** view (top-right) lists what you finished, day by day —
steps under the goal they belonged to, plus anything you wrapped up
outright. No percentages, no streaks; just evidence that it adds up. On
your first sitting of the day, execution mode shows a small "Yesterday you
did: …" recap (or "Last time (Friday …)" after days off) until you finish
your first step. A daily rotating quote about starting small sits quietly
in the footer.

### Phone pings on park (optional)

Parking can send your next step to your phone as a push notification, so
the microtask — not the looming goal — is what you see when you glance at
your phone on a walk. It's a one-way broadcast via [ntfy](https://ntfy.sh)
(free, no account):

1. Install the **ntfy** app (App Store / Play Store).
2. In the app, subscribe to a topic with an unguessable name you invent
   (it acts as the secret, e.g. `tasker-thom-x7k2p9`).
3. Paste that topic into **Plan → Phone pings** and hit *Send test*.

Notes: messages pass through ntfy.sh's servers, so keep breadcrumbs
non-sensitive or point the field at a full URL of a self-hosted ntfy
server (both forms work). No topic configured = nothing is ever sent.
The topic is stored per device — set it on each machine you use.

**Locked-down work networks:** the field also accepts a
Slack / Teams / Discord **webhook URL** (e.g. `https://hooks.slack.com/…`)
and sends the right payload automatically — useful when a corporate proxy
blocks ntfy. In the desktop app, pings are sent from Electron's main
process using the app session's cookies (Chromium network stack, no CORS
preflight, GET query-param publishing for ntfy). If your company filter
(e.g. **Zscaler**) intercepts with an authentication page — the test
reports something like `HTTP 200 — …Authentication…` — the app handles
it largely automatically: when a ping comes back looking like a sign-in
page, the sign-in window opens on its own, SSO redirect chains usually
complete without any interaction (the window closes itself once the
destination is reached), and the ping retries. The **Network sign-in**
button next to Send test does the same thing manually. That's the same
sign-in your browser does — only interactive when your identity provider
actually wants re-verification.

**Home-screen widget (iOS):** `widget/tasker-widget.js` is a
[Scriptable](https://scriptable.app) script that pins your parked step to
the phone's home screen — a surface that can't be swiped away, unlike a
notification (iOS forbids truly undismissable notifications). Setup steps
are in the file's header. While parked it shows "☾ Parked / *next step* /
*breadcrumb*"; resuming in the app publishes a silent (`priority=min`)
state message so the widget flips to "● In session". iOS refreshes
widgets lazily (~15–30 min), so the notification stays the instant
channel and the widget the ambient one.

## Deliberate design decisions

- **Parents are never auto-completed.** Subtasks are often just the *next*
  steps, not the whole job — breaking down lazily is the intended workflow.
  When a task's children are all handled it surfaces in a distinct
  **"Wrapping up"** state with its own buttons: **✓ Finished** confirms
  it, **+ More steps** feeds it the next steps you now know about.
- **No percentages, no overdue badges, no counts.** Progress is narrative:
  what goal you're in, what step you're on, what you just finished.
- **Manual breakdown only** (for now). Pressing Too Big asks *you* for the
  smaller steps — fully offline, no API keys. AI-suggested breakdowns are an
  obvious future addition.

## Stack

Vite + React + TypeScript. No other runtime dependencies. State lives in a
single reducer (`src/model/store.ts`); the traversal algorithm is in
`src/model/traversal.ts` with tests alongside it.
