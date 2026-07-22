// tasker — parked-step home-screen widget (for the Scriptable app on iOS)
//
// Shows your last parked step permanently on the home screen: a pinned
// surface that can't be dismissed, unlike a notification. While parked it
// shows "☾ Parked / <next step> / <breadcrumb>"; after resuming it shows
// "● In session / <current step>".
//
// Setup:
//   1. Install "Scriptable" from the App Store.
//   2. In Scriptable: + (new script), paste this whole file, name it "tasker".
//   3. Edit TOPIC below to your ntfy topic (same value as in tasker's
//      Plan → Phone pings; a full self-hosted ntfy URL also works).
//   4. Long-press home screen → + → Scriptable → small or medium widget →
//      long-press the new widget → Edit Widget → Script: "tasker".
//
// iOS refreshes widgets on its own schedule (typically every 15–30 min),
// so the widget can lag the instant notification — it's the ambient
// surface, the ping is the immediate one.

const TOPIC = "CHANGE-ME"; // e.g. "tasker-thom-x7k2p9" or "https://ntfy.example.com/secret"

const base = /^https?:\/\//i.test(TOPIC)
  ? TOPIC.replace(/\/$/, "")
  : `https://ntfy.sh/${encodeURIComponent(TOPIC)}`;

let last = null;
try {
  const req = new Request(`${base}/json?poll=1&since=72h`);
  const text = await req.loadString();
  for (const line of text.trim().split("\n")) {
    if (!line) continue;
    try {
      const event = JSON.parse(line);
      if (event.event === "message") last = event;
    } catch (e) {}
  }
} catch (e) {}

const widget = new ListWidget();
widget.backgroundColor = new Color("#1c1b19");
widget.setPadding(14, 14, 12, 14);

if (TOPIC === "CHANGE-ME") {
  const t = widget.addText("Edit the script: set TOPIC to your ntfy topic");
  t.textColor = new Color("#918e86");
  t.font = Font.systemFont(12);
} else if (!last) {
  const t = widget.addText("no parked step yet");
  t.textColor = new Color("#918e86");
  t.font = Font.systemFont(12);
} else {
  const parked = (last.title || "").toLowerCase().includes("parked");
  const head = widget.addText(parked ? "☾ Parked" : "● In session");
  head.textColor = new Color(parked ? "#b5b1a8" : "#6fa385");
  head.font = Font.mediumSystemFont(11);
  widget.addSpacer(6);

  const lines = (last.message || "").split("\n");
  const step = widget.addText(
    lines[0].replace(/^Next: /, "").replace(/^Working on: /, ""),
  );
  step.textColor = Color.white();
  step.font = Font.semiboldSystemFont(15);
  step.minimumScaleFactor = 0.6;
  step.lineLimit = 3;

  if (lines[1]) {
    widget.addSpacer(4);
    const note = widget.addText(lines[1]);
    note.textColor = new Color("#918e86");
    note.font = Font.italicSystemFont(11);
    note.minimumScaleFactor = 0.7;
    note.lineLimit = 2;
  }

  widget.addSpacer();
  const when = widget.addText(
    new Date(last.time * 1000).toLocaleString([], {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  when.textColor = new Color("#6b6862");
  when.font = Font.systemFont(9);
}

widget.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000);
Script.setWidget(widget);
Script.complete();
