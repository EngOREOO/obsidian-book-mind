/** Goal pacing, stalled-book detection and mood / impact statistics. */
import type { Book } from "../types";
import { addDays, diffDays, range } from "./dates";

export function stalledBooks(books: Book[], today: string, days: number, snoozed: Record<string, string>): { book: Book; idle: number }[] {
  return books
    .filter(b => b.state === "reading" && (!snoozed[b.path] || snoozed[b.path] < today))
    .map(b => ({ book: b, idle: b.lastActivity ? diffDays(today, b.lastActivity) : days }))
    .filter(x => x.idle >= days)
    .sort((a, b) => b.idle - a.idle);
}

export function pagesInRange(books: Book[], from: string, to: string): number {
  let n = 0;
  for (const b of books) for (const [d, p] of Object.entries(b.daily)) if (d >= from && d <= to) n += p;
  return n;
}

export interface GoalPace {
  goal: number;
  finished: number;
  remaining: number;
  daysLeft: number;
  expected: number;
  /** finished − expected-by-today (negative = behind). */
  delta: number;
  requiredPerDay: number;
  currentPerDay: number;
  extraPerDay: number;
}

export function goalPace(books: Book[], goal: number, today: string): GoalPace | null {
  if (!(goal > 0)) return null;
  const year = today.slice(0, 4);
  const jan1 = year + "-01-01", dec31 = year + "-12-31";
  const finished = books.filter(b => b.state === "finished" && b.finished.startsWith(year)).length;
  const remaining = Math.max(0, goal - finished);
  const daysLeft = diffDays(dec31, today) + 1;
  const yearDays = diffDays(dec31, jan1) + 1;
  const expected = Math.round((goal * (diffDays(today, jan1) + 1)) / yearDays * 10) / 10;
  const lengths = books.filter(b => b.state === "finished" && b.pages > 0).map(b => b.pages);
  const avgPages = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 250;
  const inProgress = books.filter(b => b.state === "reading").reduce((a, b) => a + Math.max(0, Math.min(b.current, b.pages || b.current) - b.startPage), 0);
  const pagesNeeded = Math.max(0, remaining * avgPages - Math.min(inProgress, remaining * avgPages * 0.9));
  const requiredPerDay = remaining ? Math.ceil(pagesNeeded / Math.max(1, daysLeft)) : 0;
  const currentPerDay = Math.round(pagesInRange(books, addDays(today, -29), today) / 30);
  return { goal, finished, remaining, daysLeft, expected, delta: Math.round((finished - expected) * 10) / 10, requiredPerDay, currentPerDay, extraPerDay: Math.max(0, requiredPerDay - currentPerDay) };
}

export interface MoodStats {
  moods: Record<string, number>;
  impactByGenre: { genre: string; avg: number; n: number }[];
  topImpact: Book[];
}

export function moodStats(books: Book[]): MoodStats {
  const moods: Record<string, number> = {};
  const g: Record<string, { sum: number; n: number }> = {};
  for (const b of books) {
    if (b.mood) moods[b.mood] = (moods[b.mood] || 0) + 1;
    if (b.impact > 0) for (const x of b.genre.length ? b.genre : ["—"]) { const e = g[x] || (g[x] = { sum: 0, n: 0 }); e.sum += b.impact; e.n++; }
  }
  return {
    moods,
    impactByGenre: Object.entries(g).map(([genre, e]) => ({ genre, avg: Math.round((e.sum / e.n) * 10) / 10, n: e.n })).sort((a, b) => b.avg - a.avg),
    topImpact: books.filter(b => b.impact > 0).sort((a, b) => b.impact - a.impact).slice(0, 3),
  };
}

/** Pages per date across all books (for charts / wrap-ups). */
export function dailyPages(books: Book[], from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of range(from, to)) out[d] = 0;
  for (const b of books) for (const [d, p] of Object.entries(b.daily)) if (d in out) out[d] += p;
  return out;
}
