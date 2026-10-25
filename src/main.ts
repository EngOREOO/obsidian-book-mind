import { MarkdownRenderChild, Notice, Plugin, TFile, normalizePath, requestUrl, type Editor, type WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, type BMData, type Book, type BookStatus, type Grade, type Highlight, type MetadataResult } from "./types";
import { setLang, t } from "./i18n";
import { ReadingJourneyBridge } from "./integrations/readingJourney";
import { Library } from "./services/library";
import { toFrontmatter } from "./services/metadata";
import { parseBook, safeName } from "./core/books";
import { insertUnderHeading, appendToSection, SESSIONS_HEAD, toDeckLines } from "./core/notes";
import { review as srsReview } from "./core/srs";
import { stalledBooks } from "./core/insights";
import { formatDuration } from "./core/velocity";
import { todayKey, fmt1 } from "./core/dates";
import { BookMindView, renderBlock, VIEW_TYPE } from "./ui/SidebarView";
import { BookSuggestModal, FetchModal, FlashcardModal, LinkModal, MoodModal, NudgeModal, QuoteCardModal, StopSessionModal } from "./ui/Modals";
import { BookMindSettingTab } from "./ui/SettingsTab";
import { exportWrapUp } from "./reports/wrapUp";

export interface Renderable { render(): void }

function normalize(raw: unknown): BMData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<BMData>;
  return {
    version: 1,
    lang: r.lang === "ar" ? "ar" : "en",
    settings: { ...DEFAULT_SETTINGS, ...(r.settings || {}) },
    reviews: r.reviews || {},
    reviewedToday: r.reviewedToday && r.reviewedToday.date === todayKey() ? r.reviewedToday : { date: todayKey(), ids: [] },
    session: r.session || null,
    snoozed: r.snoozed || {},
    standaloneHours: r.standaloneHours || {},
    ui: { tab: "today", ...(r.ui || {}) },
  };
}

export default class BookMindPlugin extends Plugin {
  data!: BMData;
  rj!: ReadingJourneyBridge;
  library!: Library;
  renderers = new Set<Renderable>();
  private statusEl: HTMLElement | null = null;
  private refreshTimer: number | null = null;
  private settingTab: BookMindSettingTab | null = null;

  async onload(): Promise<void> {
    this.data = normalize(await this.loadData());
    setLang(this.data.lang);
    this.rj = new ReadingJourneyBridge(this.app, { render: () => this.refreshSoon() }, () => this.data.settings.useReadingJourney);
    this.library = new Library(this.app, () => this.rj.folder(this.data.settings.booksFolder), () => this.refresh());

    this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new BookMindView(leaf, this));
    this.addRibbonIcon("brain", t("appTitle"), () => this.activateView());
    this.settingTab = new BookMindSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("bm-statusbar");
    this.statusEl.addEventListener("click", () => this.onStatusClick());

    this.registerCommands();
    this.registerMarkdownCodeBlockProcessor("book-mind", (src, el, ctx) => ctx.addChild(new BlockChild(el, this, src)));

    const touch = (path: string) => { if (this.library.inFolder(path)) { this.library.invalidate(); this.library.scheduleIndex(); this.refreshSoon(); } };
    this.registerEvent(this.app.metadataCache.on("changed", f => touch(f.path)));
    this.registerEvent(this.app.vault.on("delete", f => touch(f.path)));
    this.registerEvent(this.app.vault.on("rename", (f, old) => { touch(f.path); touch(old); if (this.data.session?.bookPath === old) { this.data.session.bookPath = f.path; void this.save(); } }));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor: Editor) => {
      const sel = editor.getSelection().trim();
      if (!sel) return;
      menu.addItem(i => i.setTitle(t("addHighlight")).setIcon("quote").onClick(() => this.addHighlightFromSelection(sel)));
      menu.addItem(i => i.setTitle(t("quoteCard")).setIcon("image").onClick(() => this.openQuoteCard(sel, this.library.activeBook())));
    }));
    this.registerInterval(window.setInterval(() => this.tick(), 1000));

    this.app.workspace.onLayoutReady(() => { this.rj.get(); void this.library.index(); });
  }

  onunload(): void {
    this.rj.detach();
    this.library.cancel();
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
  }

  async save(): Promise<void> { await this.saveData(this.data); }

  // ---------------------------------------------------------------- rendering
  refresh(): void {
    this.library.invalidate();
    for (const r of this.renderers) { try { r.render(); } catch (e) { console.error("Book Mind render error", e); } }
    this.updateStatusBar();
  }

  refreshSoon(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => { this.refreshTimer = null; this.refresh(); }, 250);
  }

  afterEdit(): void { this.refresh(); this.settingTab?.redraw(); }

  /** Only the clock text changes every second — never a full re-render (keeps inputs and focus alive). */
  private tick(): void {
    if (this.data.reviewedToday.date !== todayKey()) { this.data.reviewedToday = { date: todayKey(), ids: [] }; this.refresh(); }
    if (!this.data.session) return;
    const txt = this.clockText();
    document.querySelectorAll<HTMLElement>(".bm-clock").forEach(el => el.setText(txt));
    this.updateStatusBar();
  }

  elapsedMs(): number {
    const s = this.data.session;
    if (!s) return 0;
    return Math.max(0, (s.pausedAt ?? Date.now()) - s.startedAt - s.pausedMs);
  }

  clockText(): string {
    const sec = Math.floor(this.elapsedMs() / 1000);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = (n: number) => String(n).padStart(2, "0");
    return (h ? h + ":" : "") + p(m) + ":" + p(s);
  }

  stalled(): { book: Book; idle: number }[] {
    return stalledBooks(this.library.books(), todayKey(), this.data.settings.stalledDays, this.data.snoozed);
  }

  updateStatusBar(): void {
    const el = this.statusEl;
    if (!el) return;
    const s = this.data.session;
    const st = s ? [] : this.stalled();
    const show = this.data.settings.showStatusBar && (!!s || st.length > 0);
    el.toggle(show);
    if (!show) return;
    if (s) {
      const b = this.library.book(s.bookPath);
      el.setText((s.pausedAt ? "⏸ " : "📖 ") + this.clockText() + (b ? " · " + b.name : ""));
    } else el.setText(t("statusStalled", { n: st.length }));
  }

  private onStatusClick(): void {
    if (this.data.session) { void this.activateView(); return; }
    const st = this.stalled();
    if (st.length) new NudgeModal(this, st[0].book, st[0].idle).open();
  }

  async activateView(): Promise<void> {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      const right = ws.getRightLeaf(false);
      if (!right) return;
      leaf = right;
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await ws.revealLeaf(leaf);
  }

  async toggleLang(): Promise<void> {
    this.data.lang = this.data.lang === "en" ? "ar" : "en";
    setLang(this.data.lang);
    await this.save();
    this.afterEdit();
  }

  yearGoal(): number { return this.rj.yearGoal(this.data.settings.yearGoal); }

  async ensureFolder(path: string): Promise<void> {
    let cur = "";
    for (const p of normalizePath(path).split("/").filter(Boolean)) {
      cur = cur ? cur + "/" + p : p;
      if (!this.app.vault.getAbstractFileByPath(cur)) { try { await this.app.vault.createFolder(cur); } catch { /* exists */ } }
    }
  }

  fileOf(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(path);
    return f instanceof TFile ? f : null;
  }

  openBook(path: string): void {
    const f = this.fileOf(path);
    if (f) void this.app.workspace.getLeaf(false).openFile(f);
  }

  // ---------------------------------------------------------------- reading sessions
  async startSession(book: Book): Promise<void> {
    const s = this.data.session;
    if (s) { new Notice(t("sessionRunning", { book: this.library.book(s.bookPath)?.name || s.bookPath })); return; }
    this.data.session = { bookPath: book.path, startPage: book.current, startedAt: Date.now(), pausedAt: null, pausedMs: 0, notes: [] };
    if (book.rawStatus !== "reading" && book.state !== "finished") await this.setStatus(book.path, "reading", true);
    await this.save();
    this.refresh();
  }

  async togglePause(): Promise<void> {
    const s = this.data.session;
    if (!s) return;
    if (s.pausedAt) { s.pausedMs += Date.now() - s.pausedAt; s.pausedAt = null; } else s.pausedAt = Date.now();
    await this.save();
    this.refresh();
  }

  async addSessionNote(text: string): Promise<void> {
    const s = this.data.session;
    const clean = text.trim();
    if (!s || !clean) return;
    s.notes.push(clean);
    await this.save();
    new Notice(t("noteAdded"));
  }

  async discardSession(): Promise<void> {
    this.data.session = null;
    await this.save();
    new Notice(t("discarded"));
    this.refresh();
  }

  finishSessionPrompt(): void {
    const s = this.data.session;
    if (!s) return;
    const b = this.library.book(s.bookPath);
    if (!b) { void this.discardSession(); return; }
    new StopSessionModal(this, b, s.startPage, Math.max(1, Math.round(this.elapsedMs() / 60000)), s.notes.join(" · ")).open();
  }

  /** Writes a finished session through Reading Journey (so its hours, Habit Journey and the Identity Tracker update). */
  async logSession(book: Book, endPage: number, minutes: number, notes: string): Promise<void> {
    const hours = Math.round((minutes / 60) * 100) / 100;
    const from = this.data.session?.bookPath === book.path ? this.data.session.startPage : book.current;
    const finishedNow = book.pages > 0 && endPage >= book.pages && book.state !== "finished";
    const rj = this.rj.get();
    if (rj && typeof rj.logProgress === "function") await rj.logProgress(book.path, { page: endPage, hours, session: true, notes });
    else await this.standaloneLog(book, endPage, hours, notes);

    const pages = Math.max(0, endPage - from);
    const time = formatDuration(hours, { h: t("unitH"), m: t("unitM") });
    const pph = hours > 0 && pages > 0 ? Math.round(pages / hours) : 0;
    const line = "- " + t("sessionLine", { date: todayKey(), from, to: endPage, pages, time, speed: pph ? " · " + pph + " p/h" : "" }) + (notes ? " — " + notes.replace(/\n+/g, " ") : "");
    const f = this.fileOf(book.path);
    if (f) await this.app.vault.process(f, c => insertUnderHeading(c, SESSIONS_HEAD, line));
    if (!rj) new Notice(t("sessionSaved", { pages, time, pph }));

    if (this.data.session?.bookPath === book.path) this.data.session = null;
    await this.save();
    this.refresh();
    if (finishedNow) { new Notice(t("finishedBook", { book: book.name }), 6000); new MoodModal(this, book).open(); }
  }

  /** Same frontmatter writes as Reading Journey's logProgress, for vaults without it. */
  private async standaloneLog(book: Book, page: number, hours: number, notes: string): Promise<void> {
    const f = this.fileOf(book.path);
    const today = todayKey();
    if (f) await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
      const cur = parseBook(f.path, f.basename, fm).current;
      const p = Math.max(0, Math.round(book.pages ? Math.min(page, book.pages) : page));
      if (p > 0) {
        const kept = (Array.isArray(fm.log) ? fm.log : []).filter((x: unknown) => (x && typeof x === "object" ? (x as { date?: string }).date !== today : !String(x).startsWith(today + "|")));
        kept.push({ date: today, page: p });
        fm.log = kept;
        if (fm.status !== "finished" && fm.status !== "reading") fm.status = "reading";
        if (!fm.started) fm.started = today;
      }
      if (p > cur || hours > 0) {
        if (!Array.isArray(fm.sessions)) fm.sessions = [];
        (fm.sessions as unknown[]).push({ id: "s-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7), date: today, fromPage: cur, toPage: p, pages: Math.max(0, p - cur), hours, notes });
      }
      if (book.pages > 0 && p >= book.pages && fm.status !== "finished") { fm.status = "finished"; fm.finished = today; }
    });
    if (hours > 0) this.data.standaloneHours[today] = Math.round(((this.data.standaloneHours[today] || 0) + hours) * 100) / 100;
  }

  async updatePage(book: Book, page: number): Promise<void> {
    const finishedNow = book.pages > 0 && page >= book.pages && book.state !== "finished";
    const rj = this.rj.get();
    if (rj && typeof rj.logProgress === "function") await rj.logProgress(book.path, { page });
    else await this.standaloneLog(book, page, 0, "");
    this.refresh();
    if (finishedNow) new MoodModal(this, book).open();
  }

  async setStatus(path: string, status: BookStatus, quiet = false): Promise<void> {
    const f = this.fileOf(path);
    if (!f) return;
    await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
      fm.status = status;
      if (status === "reading" && !fm.started) fm.started = todayKey();
      if (status === "finished" && !fm.finished) fm.finished = todayKey();
    });
    if (!quiet && status === "dropped") new Notice(t("markedDropped", { book: f.basename }));
    this.refreshSoon();
  }

  async snooze(path: string): Promise<void> {
    const d = new Date(); d.setDate(d.getDate() + 7);
    this.data.snoozed[path] = d.toISOString().slice(0, 10);
    await this.save();
    new Notice(t("snoozed"));
    this.refresh();
  }

  async saveMood(path: string, mood: string, impact: number): Promise<void> {
    const f = this.fileOf(path);
    if (!f) return;
    await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
      if (mood) fm.bm_mood = mood; else delete fm.bm_mood;
      if (impact > 0) fm.bm_impact = impact; else delete fm.bm_impact;
    });
    new Notice(t("moodSaved", { book: f.basename }));
    this.refreshSoon();
  }

  // ---------------------------------------------------------------- highlights & flashcards
  async gradeHighlight(h: Highlight, grade: Grade): Promise<void> {
    const today = todayKey();
    this.data.reviews[h.id] = srsReview(this.data.reviews[h.id], grade, today);
    if (this.data.reviewedToday.date !== today) this.data.reviewedToday = { date: today, ids: [] };
    if (!this.data.reviewedToday.ids.includes(h.id)) this.data.reviewedToday.ids.push(h.id);
    await this.save();
    this.refresh();
  }

  async addHighlight(book: Book, text: string): Promise<void> {
    const f = this.fileOf(book.path);
    if (!f) return;
    await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
      const q = Array.isArray(fm.quotes) ? fm.quotes : [];
      if (!q.some((x: unknown) => (typeof x === "string" ? x : (x as { text?: string })?.text) === text)) q.push(text);
      fm.quotes = q;
    });
    new Notice(t("highlightAdded", { book: book.name }));
    this.library.scheduleIndex(300);
  }

  private addHighlightFromSelection(text: string): void {
    const b = this.library.activeBook();
    if (b) void this.addHighlight(b, text);
    else new BookSuggestModal(this, this.library.books(), bk => void this.addHighlight(bk, text)).open();
  }

  async addFlashcard(book: Book, q: string, a: string): Promise<void> {
    const f = this.fileOf(book.path);
    if (!f || !q.trim() || !a.trim()) return;
    const line = "- " + q.trim().replace(/::/g, ":") + "::" + a.trim().replace(/::/g, ":");
    await this.app.vault.process(f, c => appendToSection(c, "## Flashcards", line));
    new Notice(t("flashSaved", { book: book.name }));
    this.library.scheduleIndex(300);
  }

  async exportFlashcards(): Promise<void> {
    await this.library.index();
    const cards = this.library.flashcards;
    if (!cards.length) { new Notice(t("noFlashcards")); return; }
    const folder = normalizePath(this.data.settings.flashcardsFolder.trim() || "Flashcards");
    await this.ensureFolder(folder);
    const deck = normalizePath(folder + "/Book Mind Deck.md");
    const byBook = new Map<string, typeof cards>();
    for (const c of cards) (byBook.get(c.bookName) || byBook.set(c.bookName, []).get(c.bookName)!).push(c);
    const md: string[] = ["#flashcards", ""];
    for (const [name, list] of byBook) md.push("## [[" + name + "]]", "#flashcards/" + name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, ""), "", ...toDeckLines(list), "");
    const tsv = cards.map(c => [c.question, c.answer, "book::" + c.bookName.replace(/\s+/g, "_")].map(x => x.replace(/[\t\n]/g, " ")).join("\t")).join("\n") + "\n";
    await this.writeFile(deck, md.join("\n"));
    await this.writeFile(normalizePath(folder + "/Book Mind Anki.txt"), tsv);
    new Notice(t("flashExported", { n: cards.length, path: deck }));
  }

  private async writeFile(path: string, body: string): Promise<void> {
    const f = this.fileOf(path);
    if (f) await this.app.vault.modify(f, body); else await this.app.vault.create(path, body);
  }

  openQuoteCard(text: string, book?: Book): void {
    new QuoteCardModal(this, text, book ? (book.author ? book.author + " · " : "") + book.name : "").open();
  }

  // ---------------------------------------------------------------- metadata
  private async coverValue(r: MetadataResult, title: string): Promise<string> {
    if (!r.cover || !this.data.settings.downloadCovers) return r.cover;
    try {
      const res = await requestUrl({ url: r.cover });
      const folder = normalizePath(this.data.settings.coversFolder || "Books/Covers");
      await this.ensureFolder(folder);
      const ext = (res.headers["content-type"] || "").includes("png") ? "png" : "jpg";
      let path = normalizePath(folder + "/" + (safeName(title) || "cover") + "." + ext);
      for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = normalizePath(folder + "/" + safeName(title) + " " + n + "." + ext);
      await this.app.vault.createBinary(path, res.arrayBuffer);
      return path;
    } catch { return r.cover; }
  }

  async createBookFromMetadata(r: MetadataResult): Promise<void> {
    const folder = this.rj.folder(this.data.settings.booksFolder);
    await this.ensureFolder(folder);
    const title = safeName(r.title) || "Untitled";
    let path = normalizePath(folder + "/" + title + ".md");
    for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = normalizePath(folder + "/" + title + " " + n + ".md");
    // same skeleton Reading Journey creates, so its dashboard card renders inside the note
    const file = await this.app.vault.create(path, "---\nrj: book\n---\n\n```reading-book\n```\n\n## Notes & Quotes\n- \n\n## Highlights\n\n## Flashcards\n");
    const cover = await this.coverValue(r, title);
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      Object.assign(fm, toFrontmatter({ ...r, cover }));
      fm.status = "want"; fm.format = "paper"; fm.start_page = 0; fm.log = []; fm.sessions = []; fm.quotes = []; fm.ideas = [];
    });
    new Notice(t("created", { path }));
    await this.app.workspace.getLeaf(false).openFile(file);
    this.refreshSoon();
  }

  /** Fill only empty fields of an existing book note — never overwrite what the user wrote. */
  async fillBook(file: TFile, r: MetadataResult): Promise<void> {
    const cover = await this.coverValue(r, file.basename);
    let n = 0;
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(toFrontmatter({ ...r, cover }))) {
        const cur = fm[k];
        if (cur === undefined || cur === null || cur === "" || cur === 0 || (Array.isArray(cur) && !cur.length)) { fm[k] = v; if (k !== "rj") n++; }
      }
    });
    new Notice(t("updated", { n, book: file.basename }));
    this.refreshSoon();
  }

  // ---------------------------------------------------------------- commands
  private registerCommands(): void {
    const withBook = (fn: (b: Book) => void) => () => {
      const b = this.library.activeBook();
      if (b) fn(b); else new Notice(t("notBook"));
    };
    this.addCommand({ id: "open", name: t("cmdOpen"), callback: () => this.activateView() });
    this.addCommand({ id: "add-book", name: t("cmdFetch"), callback: () => new FetchModal(this, null).open() });
    this.addCommand({
      id: "fetch-current", name: t("cmdFetchCurrent"),
      callback: () => { const f = this.app.workspace.getActiveFile(); if (f) new FetchModal(this, f).open(); else new Notice(t("notBook")); },
    });
    this.addCommand({
      id: "toggle-session", name: t("cmdStart"),
      callback: () => {
        if (this.data.session) { this.finishSessionPrompt(); return; }
        const active = this.library.activeBook();
        if (active) { void this.startSession(active); return; }
        new BookSuggestModal(this, this.library.books().filter(b => b.state !== "finished" && b.state !== "dropped"), b => void this.startSession(b)).open();
      },
    });
    this.addCommand({ id: "review-highlights", name: t("cmdReview"), callback: () => { this.data.ui.tab = "today"; void this.activateView(); this.refresh(); } });
    this.addCommand({
      id: "suggest-links", name: t("cmdLinks"),
      callback: () => { const f = this.app.workspace.getActiveFile(); if (f && f.extension === "md") new LinkModal(this, f).open(); },
    });
    this.addCommand({
      id: "quote-card", name: t("cmdCard"),
      editorCallback: (editor: Editor) => { const s = editor.getSelection().trim(); if (s) this.openQuoteCard(s, this.library.activeBook()); else new Notice(t("noSelection")); },
    });
    this.addCommand({ id: "add-flashcard", name: t("cmdFlashAdd"), callback: () => new FlashcardModal(this, this.library.activeBook() || null).open() });
    this.addCommand({ id: "export-flashcards", name: t("cmdFlashExport"), callback: () => this.exportFlashcards() });
    this.addCommand({ id: "wrap-month", name: t("cmdWrapMonth"), callback: () => exportWrapUp(this, todayKey().slice(0, 7)) });
    this.addCommand({ id: "wrap-year", name: t("cmdWrapYear"), callback: () => exportWrapUp(this, todayKey().slice(0, 4)) });
    this.addCommand({ id: "rate-mood", name: t("cmdMood"), callback: withBook(b => new MoodModal(this, b).open()) });
    this.addCommand({ id: "mark-dropped", name: t("cmdDrop"), callback: withBook(b => void this.setStatus(b.path, "dropped")) });
    this.addCommand({ id: "toggle-language", name: t("cmdLang"), callback: () => this.toggleLang() });
  }

  openSettings(): void {
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
    if (!setting) return;
    setting.open();
    setting.openTabById(this.manifest.id);
  }

  sessionHoursToday(): string { return fmt1(this.rj.hours(todayKey(), this.data.standaloneHours)); }
}

class BlockChild extends MarkdownRenderChild {
  constructor(el: HTMLElement, private plugin: BookMindPlugin, private src: string) { super(el); }
  onload(): void { this.plugin.renderers.add(this); this.render(); }
  onunload(): void { this.plugin.renderers.delete(this); }
  render(): void { renderBlock(this.plugin, this.containerEl, this.src); }
}
