/** Spaced repetition for highlights — a compact SM-2 variant. State lives in data.json, keyed by quote hash. */
import type { Grade, Highlight, ReviewState } from "../types";
import { addDays } from "./dates";

/** Stable FNV-1a hash of the normalised quote text (survives renames and Reading Journey re-saves). */
export function highlightId(text: string): string {
  const s = text.replace(/\s+/g, " ").trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return "q" + (h >>> 0).toString(36);
}

export const freshState = (today: string): ReviewState => ({ ease: 2.5, interval: 0, due: today, reps: 0, lapses: 0, last: "" });

export function review(prev: ReviewState | undefined, grade: Grade, today: string): ReviewState {
  const s = { ...(prev || freshState(today)) };
  if (grade === 0) {
    s.reps = 0; s.lapses++; s.interval = 1; s.ease = Math.max(1.3, s.ease - 0.2);
  } else {
    s.reps++;
    const factor = grade === 1 ? 0.8 : grade === 3 ? 1.3 : 1;
    s.interval = s.reps === 1 ? (grade === 3 ? 3 : 1) : s.reps === 2 ? (grade === 3 ? 6 : 3) : Math.max(1, Math.round(s.interval * s.ease * factor));
    s.ease = Math.min(3, Math.max(1.3, s.ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0)));
  }
  s.due = addDays(today, s.interval);
  s.last = today;
  return s;
}

const dayHash = (id: string, day: string): number => {
  let h = 0;
  for (const c of id + day) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
};

/** Today's queue: due highlights (oldest due first, ties shuffled per day), minus those already reviewed today. */
export function dueToday(all: Highlight[], reviews: Record<string, ReviewState>, today: string, reviewed: string[], limit: number): Highlight[] {
  const done = new Set(reviewed);
  return all
    .filter(h => !done.has(h.id) && (reviews[h.id]?.due || today) <= today)
    .sort((a, b) => (reviews[a.id]?.due || today).localeCompare(reviews[b.id]?.due || today) || dayHash(a.id, today) - dayHash(b.id, today))
    .slice(0, Math.max(0, limit - done.size));
}

/** A deterministic "highlight of the day" for when the queue is empty. */
export function highlightOfDay(all: Highlight[], today: string): Highlight | null {
  if (!all.length) return null;
  return all.slice().sort((a, b) => dayHash(a.id, today) - dayHash(b.id, today))[0];
}

/** How firmly a highlight is remembered — used to rank "top quotes" in wrap-ups. */
export const strength = (s: ReviewState | undefined): number => (s ? s.reps * s.ease + s.interval / 10 : 0);
