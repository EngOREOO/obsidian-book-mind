import type { Book } from "../types";

export interface SeriesInfo {
  name: string;
  books: Book[];
  total: number;
  finished: number;
  pct: number;
  missing: number[];
  next: Book | null;
}

export function groupSeries(books: Book[]): SeriesInfo[] {
  const map = new Map<string, Book[]>();
  for (const b of books) if (b.series) {
    const key = b.series.toLowerCase();
    (map.get(key) || map.set(key, []).get(key)!).push(b);
  }
  const out: SeriesInfo[] = [];
  for (const list of map.values()) {
    list.sort((a, b) => (a.volume || 999) - (b.volume || 999) || a.name.localeCompare(b.name));
    const maxVol = Math.max(0, ...list.map(b => b.volume));
    const total = Math.max(list.length, maxVol, ...list.map(b => b.seriesTotal));
    const finished = list.filter(b => b.state === "finished").length;
    const owned = new Set(list.map(b => b.volume).filter(Boolean));
    const missing: number[] = [];
    if (owned.size) for (let i = 1; i <= total && missing.length < 50; i++) if (!owned.has(i)) missing.push(i);
    const next = list.find(b => b.state === "reading") || list.find(b => b.state !== "finished" && b.state !== "dropped") || null;
    out.push({ name: list[0].series, books: list, total, finished, pct: total ? Math.round((finished / total) * 100) : 0, missing, next });
  }
  return out.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
}
