/**
 * Body parsing for book notes: highlights (`## Highlights` / `## Quotes` / `## اقتباسات` sections and `#quote`
 * lines), flashcards (`Question::Answer` under `## Flashcards`) and the managed session log section.
 */
import type { Flashcard } from "../types";

const HIGHLIGHT_HEAD = /^(highlights?|quotes?|kindle highlights|اقتباسات|مقتطفات|الاقتباسات)$/i;
const FLASH_HEAD = /^(flashcards?|بطاقات|البطاقات)$/i;
export const SESSIONS_HEAD = "## Reading Sessions";

interface Section { title: string; level: number; lines: string[] }

function sections(body: string): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) fence = !fence;
    const h = !fence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      cur = { title: h[2].trim(), level: h[1].length, lines: [] };
      out.push(cur);
    } else if (cur && !fence) cur.lines.push(line);
  }
  return out;
}

const stripFrontmatter = (t: string) => t.replace(/^---\n[\s\S]*?\n---(\n|$)/, "");
const clean = (s: string) => s.replace(/(^|\s)#quote\b/gi, " ").replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s*)+/, "").replace(/^["“”«»]|["“”«»]$/g, "").trim();

/** Collect sub-sections too: everything until the next heading of the same or a higher level. */
function sectionBody(all: Section[], i: number): string[] {
  const lines = [...all[i].lines];
  for (let j = i + 1; j < all.length && all[j].level > all[i].level; j++) lines.push(...all[j].lines);
  return lines;
}

export function extractHighlights(content: string): string[] {
  const body = stripFrontmatter(content);
  const found: string[] = [];
  const all = sections(body);
  all.forEach((s, i) => {
    if (!HIGHLIGHT_HEAD.test(s.title)) return;
    let para: string[] = [];
    const flush = () => { const t = clean(para.map(l => l.replace(/^\s*>\s?/, "")).join(" ")); if (t.length >= 8) found.push(t); para = []; };
    for (const line of sectionBody(all, i)) {
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) { flush(); para.push(line); }
      else if (/^\s*>/.test(line)) { if (para.length && !/^\s*>/.test(para[para.length - 1])) flush(); para.push(line); }
      else if (!line.trim()) flush();
      else if (para.length) para.push(line);
    }
    flush();
  });
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) { fence = !fence; continue; }
    if (!fence && /(^|\s)#quote\b/i.test(line)) { const t = clean(line); if (t.length >= 8) found.push(t); }
  }
  return [...new Set(found)];
}

export function extractFlashcards(content: string): { question: string; answer: string }[] {
  const all = sections(stripFrontmatter(content));
  const out: { question: string; answer: string }[] = [];
  all.forEach((s, i) => {
    if (!FLASH_HEAD.test(s.title)) return;
    for (const line of sectionBody(all, i)) {
      const m = /^\s*(?:[-*+]\s+)?(.+?)\s*::\s*(.+?)\s*$/.exec(line);
      if (m) out.push({ question: m[1], answer: m[2] });
    }
  });
  return out;
}

/** Insert `line` right under `heading` (creating the section at the end if needed). Newest entries first. */
export function insertUnderHeading(content: string, heading: string, line: string): string {
  const lines = content.split("\n");
  const idx = lines.findIndex(l => l.trim().toLowerCase() === heading.toLowerCase());
  if (idx >= 0) { lines.splice(idx + 1, 0, line); return lines.join("\n"); }
  return content.replace(/\s*$/, "") + "\n\n" + heading + "\n" + line + "\n";
}

/** Append `line` at the end of the section under `heading` (creating it if needed). */
export function appendToSection(content: string, heading: string, line: string): string {
  const lines = content.split("\n");
  const idx = lines.findIndex(l => l.trim().toLowerCase() === heading.toLowerCase());
  if (idx < 0) return content.replace(/\s*$/, "") + "\n\n" + heading + "\n" + line + "\n";
  const level = (/^#+/.exec(heading) || ["##"])[0].length;
  let end = idx + 1;
  while (end < lines.length && !(new RegExp("^#{1," + level + "}\\s").test(lines[end]))) end++;
  let at = end;
  while (at > idx + 1 && !lines[at - 1].trim()) at--;
  lines.splice(at, 0, line);
  return lines.join("\n");
}

export const toDeckLines = (cards: Flashcard[]): string[] => cards.map(c => c.question.replace(/::/g, ":") + "::" + c.answer.replace(/::/g, ":"));
