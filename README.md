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
- **Too Daunting** is the defining feature. If the current task feels too large to
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

### Work and Life

Two fully separate spaces, toggled top-left. **Work** and **Life** each
have their own goals, backlog, journey, journal, and Today picks — nothing
bleeds across, so a wall of home errands never lands on top of your work
queue (and vice versa). Switching is instant; each space remembers where
you were. A goal that ends up in the wrong space moves over cleanly:
**Plan → hover a goal → →L / →W** carries the whole subtree across. The
active space is a per-device view preference — it isn't synced, so one
device can sit in Work while another is in Life.

### Focus first today

An optional morning ritual (**Today** in the top nav): pick a couple of
goals to focus first today. They **jump to the top** so they surface
first — but nothing is hidden and everything stays reachable (switch-goal
still reaches every goal, and a goal you just made is never invisible).
The current goal shows a **★ Today** marker when it's one of your picks,
and a gentle "today's goals are all done" beat fires when you finish them,
after which execution just flows on to the rest. A quiet, dismissible
morning prompt offers it when you have more than one goal in play; the
marker auto-expires at the end of its day. To work on any goal *right
now*, hit its **▶ start** in Planning — it jumps to the front and drops
you into Focus.

### Context helpers

Hiding the hierarchy costs you context, so execution mode has small tools
for externalized working memory:

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
- **Do now** (`a` or "do now"): think of something you want to do *this
  second*? Type it and it becomes the current task immediately, slotted in
  just ahead of what you were on — which flows right back once you finish.
  Add-and-start in one move, no trip to Planning.
- **Lineage breadcrumb**: a deep subtask shows its full path — `BigW Ticket
  › Section 2 › 2a` — so "2a of *what*?" is never a question. (Replaces the
  old immediate-parent-only line.)
- **Recent trail**: your last three finished steps, so re-entry after a
  break means rereading your own momentum instead of reconstructing it.

**Question tasks.** A task phrased as a question (ending in `?`) gets an
**Answer** button instead of Done: write the answer and it both completes
the task and keeps the answer as a small knowledge record — shown under the
question in the Journal, and in its Planning details. Turns "sometimes my
tasks are just questions I need to answer" into a growing, searchable log
rather than a checkbox that erases what you found out.

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
`s` skip · `z` previous · `n` notes · `a` do now · `c` capture · `g` switch
goal.

### AI summary (optional, free)

Each day in the Journal has a **✨ summarize** action that rewrites your
finished tasks into tidy standup-ready bullet points. It uses
[Groq](https://console.groq.com/keys), which is free: make a key, paste it
into **Plan → AI summary**, and hit Test. Nothing is ever sent unless you
click summarize; the key is stored locally and (in the desktop app) the
call routes through the main process, so it works behind corporate proxies.
Your task titles pass through Groq's servers, so keep them non-sensitive.

### Sync across devices (optional)

Keeps **both Work and Life** in step across your machines through a single
**private GitHub Gist** — no server to run, no account beyond the GitHub
one you already have.

1. Make a token with **only the `gist` scope** at
   [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=gist&description=tasker%20sync).
2. On your main device, paste it into **Plan → Sync** and hit **Create
   private gist**. It seeds the gist with what's already on that device and
   fills in a gist id.
3. On each other device, paste the **same token** and that **gist id**, then
   **Connect**.

After that it's automatic: it reads on open, saves a debounced copy after
edits, and polls (~9 s) for changes from the other device. A small dot next
to the Work/Life toggle shows the state — **⟳ synced** (with the time),
**…** while it talks to GitHub, **⚠** if something's wrong (click it to jump
to the settings). Conflicts resolve **last-writer-wins**: if you edit the
same space on two devices while one is offline, the most recently saved one
wins, so avoid parallel offline edits to the same space. Your task titles
are stored in the gist (private, but readable by anyone with the token), so
keep genuinely sensitive detail out of titles. The token and gist id live
on each device only and are never included in Export/Import backups. In the
desktop app the sync calls route through Electron's main process, so they
work behind corporate proxies the same way pings and the AI summary do.

### Phone brain-dump → Life (optional)

Once sync is on, your phone can drop a thought **straight into Life's
Backlog** with one tap — no extra service, it rides the same private gist.
Each capture is written as its own tiny file in the gist, so a phone write
can never clobber your task data or another capture; the app drains them
into the Backlog on its next sync (~10s), then deletes the files.

Set it up on your phone once:

- **iPhone (Shortcuts app):** a two-action shortcut — *Ask for Input*
  (your thought), then *Get Contents of URL* with
  `https://api.github.com/gists/<GIST_ID>`, method **PATCH**, header
  `Authorization: Bearer <TOKEN>`, and a JSON body:

  ```json
  { "files": { "cap_life_<unique>.txt": { "content": "<your text>" } } }
  ```

  Use the *Current Date* variable for `<unique>` and the *Provided Input*
  variable for the content. Add the shortcut to your Home Screen or Share
  Sheet. **Plan → Sync** shows this recipe with your real gist id filled in,
  and a **Send test capture** button to prove the round-trip before you build
  the shortcut.
- **Android:** the free *HTTP Shortcuts* app makes the same PATCH request.

The filename just has to start with `cap_` and be unique; `cap_work_…`
routes to Work's Backlog and `cap_gripe_…` routes to the Gripes log (instead
of the default, Life's Backlog). Only one device should have **"Receive phone
captures on this device"** enabled (Plan → Sync) so a thought isn't added
twice — the created Backlog task then syncs to your other devices normally.
Capture text lives briefly in the gist, so keep it non-sensitive like the
rest.

### Gripes — the everyday-friction log

A place for complaints. Naming a nagging annoyance gets it out of your head
(the same rumination-relief principle as parking a task), and later you
either **turn it into a goal to fix** or **let it go on purpose** — nothing
rots silently in a list. Gripes live *above* the Work/Life split (one shared
log) so you can dump one from any context.

- **Capture from anywhere:** a floating 🗯 button in every mode (one tap →
  type → Enter), a **Log it** box in the Gripes view, and from your phone via
  a `cap_gripe_…` capture file (same shortcut recipe as the brain-dump, just
  the different prefix). The nav shows a count of open gripes.
- **Review:** each open gripe offers **solve in Life / Work** — which spins up
  a goal from it in that space and marks the gripe promoted — or **let it
  go**. Resolved ones fold into a collapsed list you can clear.
- Gripes ride the same sync gist, so they show up on every device.

### Reset — catching a slump (optional)

Working from home strips away the ambient cues that catch a drift, and ADHD
time-blindness means a slump is invisible from the inside. So this isn't a
get-back-to-work bark — bark and you deepen the spiral. It's **permission to
centre yourself**, on the principle that a settled brain does the rest.

- **Gentle check-ins** (Plan → *Gentle check-ins*): when you go quiet for a
  while — nothing finished for N minutes — tasker sends a warm nudge **to
  your phone** (reusing your ntfy topic) and shows a soft, dismissible banner.
  It stays silent while you're actively finishing steps (flow is never
  interrupted) and while you're parked. Configure the idle window, or turn it
  off entirely.
- **The Reset screen** (the **reset** link in Focus, or the banner): a calm
  full-screen that gives you *permission* — "a clear head is the work; the
  rest follows; no rush." From there you can **take a real reset** (pick a
  centering activity — tidy one thing, breathe, step outside, or your own list
  — with a timer so you don't watch the clock), then it eases you back to your
  single next microtask. No guilt, no to-do list.
- Your **reset options are yours to edit** (Plan) — clean the room, meditate,
  a walk, whatever actually settles you.

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
- **Manual breakdown only** (for now). Pressing Too Daunting asks *you* for the
  smaller steps — fully offline, no API keys. AI-suggested breakdowns are an
  obvious future addition.

## Stack

Vite + React + TypeScript. No other runtime dependencies. State lives in a
single reducer (`src/model/store.ts`); the traversal algorithm is in
`src/model/traversal.ts` with tests alongside it.
