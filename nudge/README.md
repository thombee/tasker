# nudge — an accountability nudger that runs beside tasker

A tiny standalone agent for your Mac. It is **not** part of tasker — it runs
on its own schedule (`launchd`) so it can reach you *when tasker is closed*,
which is exactly the state worth catching. It shares only two things with
tasker: the ntfy phone channel, and (optionally) tasker's data file.

## What it does

At most twice a day, at your real decision points, it sends one nudge to your
phone with two tappable buttons:

- **Morning** — *"In today?"* — the office decision. Your inverted signal:
  the busier going in feels, the more that feeling *is* the reason to go.
  Buttons: **In ✓ / Not today ✗**
- **Night** — *"Winding down?"* — the stay-up / 3am / finish-everything urge.
  Buttons: **Calling it ✓ / Pushing on ✗**

Your taps steer the next day. That's the whole point.

## Why it (probably) won't become wallpaper

Every nudge dies the same death: same message, same time, filtered out in a
week, then ignored, then avoided harder. The defences are baked in:

1. **Ask, don't tell.** A one-tap ✓/✗ is an act you can't do on autopilot.
2. **Quieter when ignored, not louder.** Skip a nudge and the next one
   *softens* — fewer words, gentler, eventually barely there. It stops
   chasing you. (You can't avoid something that isn't chasing you.)
3. **Silent when you're fine.** A good run (answering ✓ a few days) earns
   silence for a couple of days. Every ping has to be earned back.
4. **Vary everything.** It rotates through your lines and jitters the minute
   so your brain can't auto-file it.
5. **Observe, never nag.** It states facts ("a few days out of the office"),
   never scolds.

None of this lasts forever — you'll eventually habituate to anything. When it
goes stale, change the lines in `config.json`. You own the words.

## Setup (about 10 minutes, on your Mac)

**1. Pick two ntfy topics.** Invent two unguessable names (they act as
secrets), e.g. `nudge-thom-a7x2` and `nudge-thom-a7x2-taps`. In the **ntfy**
app on your phone, subscribe to the **first** one (the nudges). You don't need
to subscribe to the taps topic — that's just where your button presses land
for the script to read.

**2. Make your config.**
```bash
cd nudge
cp config.example.json config.json
```
Edit `config.json`: set `topic` to your nudge topic, `tapsTopic` to your taps
topic. Adjust the `windows` times to when you actually decide (morning office
call, night wind-down). Tweak the `lines` to your voice whenever you like.

**3. Test it before scheduling anything.**
```bash
node nudge.mjs --dry-run --force morning   # prints the payload, sends nothing
node nudge.mjs --force morning             # actually sends one to your phone
```
Tap **In ✓** on your phone, then:
```bash
node nudge.mjs --poll-only                 # should log:  tap: office = in
```
If that round-trips, the loop works.

**4. Schedule it.** Edit `com.tasker.nudge.plist` — set the path to `node`
(`which node`) and to `nudge.mjs`. Then:
```bash
cp com.tasker.nudge.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.tasker.nudge.plist
```
It now runs hourly, nudging only inside your windows and reading your taps
in between. Logs go to `/tmp/nudge.log`.

To stop:
```bash
launchctl unload ~/Library/LaunchAgents/com.tasker.nudge.plist
```

## Optional: the late backstop

If you also want a safety net for "haven't finished anything in days," turn on
`completionBackstop` in `config.json` and point `taskerFile` at the file
tasker autosaves to (**Plan → "Choose a file on disk"** in tasker sets that
up). It reads the newest completion time and, if it's older than `staleDays`,
sends one factual nudge. Off by default.

## Tuning

- `windows` — when each nudge is allowed to fire (local time).
- `jitterMinutes` — random delay so it doesn't land at a fixed minute.
- `silenceAfterGood` / `silenceDays` — how long a good run buys quiet.
- `lines` — everything it can say, per level. `level0` is normal; `level1`/`2`/`3`
  are the softening ladder as nudges get ignored; `streakOut` is the morning
  set used when you've answered "out" a couple of days running.

Runtime files (`config.json`, `state.json`) are gitignored — your topics and
your answers never leave your machine.
