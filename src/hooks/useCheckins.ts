import { useEffect, useRef, useState } from 'react';
import { getCheckinSettings, shouldCheckin } from '../model/checkins';
import { getPhoneTopic, sendCheckinPing } from '../model/phonePing';
import { findCurrent } from '../model/traversal';
import { AppState } from '../model/types';

// Watches for a stall and, when you've gone quiet, raises a gentle check-in:
// an in-app flag (a soft, dismissible banner) plus a phone ping if a topic is
// set. Resets the moment you finish anything — flow is never interrupted.
export function useCheckins(state: AppState): { nudging: boolean; dismiss: () => void } {
  const [nudging, setNudging] = useState(false);
  const lastActivity = useRef(Date.now());
  const lastNudge = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Finishing or skipping something (history grows) means you're engaged:
  // reset the idle clock and clear any active nudge.
  const historyLen = state.history.length;
  useEffect(() => {
    lastActivity.current = Date.now();
    setNudging(false);
  }, [historyLen]);

  // Stepping away on purpose (park) is not a stall.
  useEffect(() => {
    if (state.parked) {
      lastActivity.current = Date.now();
      setNudging(false);
    }
  }, [state.parked]);

  useEffect(() => {
    const tick = () => {
      const s = getCheckinSettings();
      const cur = stateRef.current;
      const currentId = findCurrent(cur);
      const now = Date.now();
      const fire = shouldCheckin({
        enabled: s.enabled,
        idleMin: s.idleMin,
        sinceActivityMs: now - lastActivity.current,
        sinceNudgeMs: now - lastNudge.current,
        hasCurrent: currentId !== null,
        parked: !!cur.parked,
      });
      if (!fire || !currentId) return;
      lastNudge.current = now;
      setNudging(true);
      const topic = getPhoneTopic();
      if (topic) void sendCheckinPing(topic, cur.tasks[currentId].title);
    };
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }, []);

  const dismiss = () => {
    // "I'm fine" — treat it as a fresh start so the next nudge is a full idle
    // window away.
    lastActivity.current = Date.now();
    setNudging(false);
  };

  return { nudging, dismiss };
}
