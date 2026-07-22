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
no sync — use **Plan → Export backup** to save your data to a JSON file (and
Import to restore it).

```bash
npm test         # core traversal/undo logic tests
npm run build    # production build in dist/
```

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

Keyboard shortcuts in execution mode: `d`/`Enter` done · `b` too big ·
`s` skip · `z` previous.

## Deliberate design decisions

- **Parents auto-complete** when their last child is marked done, and this
  cascades upward — finishing the last tiny step of a goal finishes the goal.
  You never re-confirm work you already did. (One press of ← Previous undoes
  the whole cascade.)
- **Skipped children block auto-completion.** If a task's children are all
  done-or-skipped but some were skipped, the task itself surfaces as the
  current task and asks "is this finished?" — you decide.
- **No percentages, no overdue badges, no counts.** Progress is narrative:
  what goal you're in, what step you're on, what you just finished.
- **Manual breakdown only** (for now). Pressing Too Big asks *you* for the
  smaller steps — fully offline, no API keys. AI-suggested breakdowns are an
  obvious future addition.

## Stack

Vite + React + TypeScript. No other runtime dependencies. State lives in a
single reducer (`src/model/store.ts`); the traversal algorithm is in
`src/model/traversal.ts` with tests alongside it.
