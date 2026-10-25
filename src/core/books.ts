/**
 * Book model — a faithful port of Reading Journey's `parseBook` (same frontmatter schema), extended
 * with Book Mind fields (series, volume, mood, impact). Pure: no Obsidian runtime imports.
 */
import type { Book, BookStatus, Session } from "../types";
import { dateStr, num } from "./dates";

export const STATUS_MAP: Record<string, BookStatus> = {
  queue: "want", want: "want", "want to read": "want", reading: "reading", paused: "paused",
  finished: "finished", done: "finished", dropped: "dropped", abandoned: "dropped",
};

export const STATUSES: BookStatus[] = ["reading", "want", "paused", "finished", "dropped"];

export const toArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  if (v === undefined || v === null || v === "") return [];
  return String(v).split(",").map(s => s.trim()).filter(Boolean);
};

export const safeName = (s: string): string => String(s || "").replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim();

/** Quotes may be strings or `{ text }` objects. */
export const quoteText = (q: unknown): string =>
  typeof q === "string" ? q.trim() : q && typeof q === "object" && "text" in q ? String((q as { text: unknown }).text || "").trim() : "";

/** Frontmatter is the minimal shape Reading Journey uses to recognise a book note. */
export const isBookFrontmatter = (fm: Record<string, unknown> | undefined | null): boolean =>
  !!fm && (fm.rj === "book" || fm.pages !== undefined || fm.author !== undefined);

export function parseBook(path: string, name: string, fm: Record<string, unknown>, mtimeDay = ""): Book {
  const log: { date: string; page: number }[] = [];
  const raw: unknown[] = Array.isArray(fm.log) ? fm.log : fm.log ? [fm.log] : [];
  for (const e of raw) {
    if (e && typeof e === "object" && !Array.isArray(e)) {
      const o = e as Record<string, unknown>;
      const date = dateStr(o.date), pg = Number(o.page);
      if (date && pg > 0) log.push({ date, page: pg });
    } else {
      const parts = String(e).split("|");
      const pg = Number(parts[1]);
      if (/^\d{4}-\d{2}-\d{2}$/.test(parts[0]) && pg > 0) log.push({ date: parts[0], page: pg });
    }
  }
  const sessions: Session[] = (Array.isArray(fm.sessions) ? fm.sessions : []).map((x: Record<string, unknown>, i: number) => ({
    id: String(x.id || "legacy-" + i), date: dateStr(x.date) || "",
    fromPage: Math.max(0, num(x.fromPage)), toPage: Math.max(0, num(x.toPage)),
    pages: Math.max(0, num(x.pages)), hours: Math.max(0, num(x.hours)), notes: String(x.notes || ""),
  })).filter((x: Session) => x.date);

  const startPage = num(fm.start_page);
  const pages = num(fm.pages);
  // pages read per day: checkpoints sorted by date, delta from the running maximum (Reading Journey's method)
  const sorted = log.slice().sort((x, y) => x.date.localeCompare(y.date) || x.page - y.page);
  let cur = startPage;
  const daily: Record<string, number> = {};
  for (const e of sorted) {
    const read = Math.max(0, e.page - cur);
    cur = Math.max(cur, e.page);
    if (read) daily[e.date] = (daily[e.date] || 0) + read;
  }
  const rawStatus = STATUS_MAP[String(fm.status || "").toLowerCase().trim()] || "";
  const state: BookStatus = rawStatus || (pages && cur >= pages ? "finished" : cur > 0 ? "reading" : "want");

  let last = mtimeDay;
  for (const e of log) if (e.date > last) last = e.date;
  for (const s of sessions) if (s.date > last) last = s.date;

  return {
    path, name,
    author: fm.author ? String(fm.author) : "",
    pages, startPage, current: cur, rawStatus, state,
    format: String(fm.format || "paper"),
    genre: toArray(fm.genre !== undefined ? fm.genre : fm.category),
    started: dateStr(fm.started), finished: dateStr(fm.finished),
    rating: Math.max(0, Math.min(5, Math.round(num(fm.rating)))),
    cover: fm.cover ? String(fm.cover) : "",
    quotes: (Array.isArray(fm.quotes) ? fm.quotes : []).map(quoteText).filter(Boolean),
    ideas: toArray(fm.ideas),
    sessions, log, daily,
    series: fm.series ? String(fm.series).trim() : "",
    volume: num(fm.volume),
    seriesTotal: num(fm.series_total),
    mood: fm.bm_mood ? String(fm.bm_mood) : "",
    impact: Math.max(0, Math.min(10, num(fm.bm_impact))),
    lastActivity: last,
  };
}

export const progressPct = (b: Book): number => (b.pages ? Math.min(100, Math.round((b.current / b.pages) * 100)) : 0);

export const isActiveReading = (b: Book): boolean => b.state === "reading";
