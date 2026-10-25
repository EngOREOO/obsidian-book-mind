/** Indexes book notes: frontmatter (sync, from the metadata cache) and bodies / highlights (async, debounced). */
import { TFile, type App } from "obsidian";
import type { Book, Flashcard, Highlight } from "../types";
import { isBookFrontmatter, parseBook } from "../core/books";
import { extractFlashcards, extractHighlights } from "../core/notes";
import { highlightId } from "../core/srs";
import { ymd } from "../core/dates";

export class Library {
  private bookCache: Book[] | null = null;
  bodies: Record<string, string> = {};
  highlights: Highlight[] = [];
  flashcards: Flashcard[] = [];
  private timer: number | null = null;

  constructor(private app: App, private folder: () => string, private onIndexed: () => void) {}

  inFolder(path: string): boolean {
    const f = this.folder();
    return !f || path.startsWith(f + "/");
  }

  files(): TFile[] {
    return this.app.vault.getMarkdownFiles().filter(f => this.inFolder(f.path) && isBookFrontmatter(this.app.metadataCache.getFileCache(f)?.frontmatter));
  }

  invalidate(): void { this.bookCache = null; }

  books(): Book[] {
    if (this.bookCache) return this.bookCache;
    this.bookCache = this.files().map(f => parseBook(f.path, f.basename, (this.app.metadataCache.getFileCache(f)?.frontmatter || {}) as Record<string, unknown>, ymd(new Date(f.stat.mtime))));
    return this.bookCache;
  }

  book(path: string): Book | undefined {
    return this.books().find(b => b.path === path);
  }

  /** Book for the active editor file, if it is a book note. */
  activeBook(): Book | undefined {
    const f = this.app.workspace.getActiveFile();
    return f ? this.book(f.path) : undefined;
  }

  scheduleIndex(delay = 600): void {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.timer = null; void this.index(); }, delay);
  }

  cancel(): void { if (this.timer) window.clearTimeout(this.timer); }

  async index(): Promise<void> {
    this.invalidate();
    const books = this.books();
    const bodies: Record<string, string> = {};
    const hs = new Map<string, Highlight>();
    const cards: Flashcard[] = [];
    for (const b of books) {
      const f = this.app.vault.getAbstractFileByPath(b.path);
      if (!(f instanceof TFile)) continue;
      let text = "";
      try { text = await this.app.vault.cachedRead(f); } catch { continue; }
      bodies[b.path] = text;
      const push = (q: string, source: Highlight["source"]) => {
        const id = highlightId(q);
        if (!hs.has(id)) hs.set(id, { id, bookPath: b.path, bookName: b.name, author: b.author, text: q, source });
      };
      b.quotes.forEach(q => push(q, "frontmatter"));
      extractHighlights(text).forEach(q => push(q, "body"));
      for (const c of extractFlashcards(text)) cards.push({ ...c, bookPath: b.path, bookName: b.name });
    }
    this.bodies = bodies;
    this.highlights = [...hs.values()];
    this.flashcards = cards;
    this.onIndexed();
  }
}
