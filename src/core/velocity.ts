/** Reading speed (pages per hour) and time-to-finish estimates, from timed sessions only. */
import type { Book } from "../types";

export interface Rate { pages: number; hours: number; pph: number; sessions: number }

const empty = (): Rate => ({ pages: 0, hours: 0, pph: 0, sessions: 0 });
const add = (r: Rate, pages: number, hours: number) => { r.pages += pages; r.hours += hours; r.sessions++; r.pph = r.hours ? r.pages / r.hours : 0; };

export interface Velocity {
  overall: Rate;
  byBook: Record<string, Rate>;
  byGenre: Record<string, Rate>;
  byFormat: Record<string, Rate>;
}

export function computeVelocity(books: Book[]): Velocity {
  const v: Velocity = { overall: empty(), byBook: {}, byGenre: {}, byFormat: {} };
  for (const b of books) {
    for (const s of b.sessions) {
      if (!(s.pages > 0 && s.hours > 0)) continue;
      add(v.overall, s.pages, s.hours);
      add(v.byBook[b.path] || (v.byBook[b.path] = empty()), s.pages, s.hours);
      const g = b.genre[0];
      if (g) add(v.byGenre[g] || (v.byGenre[g] = empty()), s.pages, s.hours);
      add(v.byFormat[b.format] || (v.byFormat[b.format] = empty()), s.pages, s.hours);
    }
  }
  return v;
}

const usable = (r: Rate | undefined, minHours: number): r is Rate => !!r && r.hours >= minHours && r.pph > 0;

export interface Estimate { hours: number; pph: number; basis: "book" | "genre" | "format" | "overall" }

/** Most specific reliable rate wins: this book → its genre → its format → overall. */
export function estimateFinish(b: Book, v: Velocity): Estimate | null {
  const remaining = Math.max(0, b.pages - b.current);
  if (!b.pages || !remaining) return null;
  const pick: [Estimate["basis"], Rate | undefined, number][] = [
    ["book", v.byBook[b.path], 0.5],
    ["genre", b.genre[0] ? v.byGenre[b.genre[0]] : undefined, 1],
    ["format", v.byFormat[b.format], 1],
    ["overall", v.overall, 0.25],
  ];
  for (const [basis, r, min] of pick) if (usable(r, min)) return { hours: remaining / r.pph, pph: r.pph, basis };
  return null;
}

export function formatDuration(hours: number, units: { h: string; m: string }): string {
  const mins = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(mins / 60), m = mins % 60;
  if (!h) return m + units.m;
  return h + units.h + (m ? " " + m + units.m : "");
}
