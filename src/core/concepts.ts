/**
 * Concept auto-linker & cross-book concept graph. Word boundaries are Unicode-aware so Arabic works
 * (JS `\b` only understands ASCII word characters).
 */
import type { Book, Highlight } from "../types";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const conceptRegex = (c: string, flags = "iu") => new RegExp("(?<![\\p{L}\\p{N}_])" + esc(c) + "(?![\\p{L}\\p{N}_])", flags);

export interface ConceptLink { concept: string; books: Book[]; quotes: Highlight[] }

/** Candidate concepts: every idea / genre / explicit `concepts` value, plus notes in the concepts folder. */
export function collectConcepts(books: Book[], extra: string[]): string[] {
  const set = new Map<string, string>();
  const put = (c: string) => { const t = c.trim(); if (t.length >= 3 && !set.has(t.toLowerCase())) set.set(t.toLowerCase(), t); };
  for (const b of books) { b.ideas.forEach(put); b.genre.forEach(put); }
  extra.forEach(put);
  return [...set.values()];
}

/** Concepts shared by 2+ books (via metadata, body text or quotes), with the quotes that mention them. */
export function conceptGraph(books: Book[], concepts: string[], bodies: Record<string, string>, highlights: Highlight[]): ConceptLink[] {
  const out: ConceptLink[] = [];
  for (const c of concepts) {
    const re = conceptRegex(c);
    const lc = c.toLowerCase();
    const hits = books.filter(b =>
      b.ideas.some(i => i.toLowerCase() === lc) || b.genre.some(g => g.toLowerCase() === lc) || re.test(bodies[b.path] || ""));
    if (hits.length < 2) continue;
    out.push({ concept: c, books: hits, quotes: highlights.filter(h => re.test(h.text)).slice(0, 6) });
  }
  return out.sort((a, b) => b.books.length - a.books.length || b.quotes.length - a.quotes.length);
}

/** Strip frontmatter, code and existing links so suggestions only target plain prose. */
export function maskProse(text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return text
    .replace(/^---\n[\s\S]*?\n---(?=\n|$)/, blank)
    .replace(/```[\s\S]*?```/g, blank)
    .replace(/`[^`\n]*`/g, blank)
    .replace(/\[\[[^\]]*\]\]/g, blank)
    .replace(/\[[^\]]*\]\([^)]*\)/g, blank);
}

export interface Suggestion { concept: string; index: number; match: string; context: string }

/** First unlinked occurrence of each candidate concept in a note. */
export function suggestLinks(text: string, candidates: string[], selfName: string): Suggestion[] {
  const prose = maskProse(text);
  const already = new Set([...text.matchAll(/\[\[([^\]|#]+)/g)].map(m => m[1].trim().toLowerCase()));
  const out: Suggestion[] = [];
  for (const c of candidates) {
    if (c.toLowerCase() === selfName.toLowerCase() || already.has(c.toLowerCase())) continue;
    const m = conceptRegex(c).exec(prose);
    if (!m) continue;
    const i = m.index;
    out.push({ concept: c, index: i, match: text.slice(i, i + m[0].length), context: text.slice(Math.max(0, i - 40), i + m[0].length + 40).replace(/\s+/g, " ") });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Apply chosen suggestions from last to first so earlier offsets stay valid. */
export function applyLinks(text: string, chosen: Suggestion[]): string {
  let out = text;
  for (const s of chosen.slice().sort((a, b) => b.index - a.index)) {
    if (out.slice(s.index, s.index + s.match.length) !== s.match) continue;
    const link = s.match === s.concept ? "[[" + s.concept + "]]" : "[[" + s.concept + "|" + s.match + "]]";
    out = out.slice(0, s.index) + link + out.slice(s.index + s.match.length);
  }
  return out;
}
