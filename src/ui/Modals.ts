import { FuzzySuggestModal, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import type BookMindPlugin from "../main";
import type { Book, MetadataResult } from "../types";
import { dir, MOODS, moodLabel, t, tk } from "../i18n";
import { searchBooks } from "../services/metadata";
import { applyLinks, collectConcepts, suggestLinks, type Suggestion } from "../core/concepts";
import { canvasToPng, drawQuoteCard, THEMES, type CardTheme } from "../services/quoteCard";
import { safeName } from "../core/books";
import { highlightId } from "../core/srs";

function prepare(modal: Modal, title: string, cls = ""): HTMLElement {
  modal.modalEl.addClass("bm-modal");
  if (cls) modal.modalEl.addClass(cls);
  modal.modalEl.setAttr("dir", dir());
  modal.titleEl.setText(title);
  modal.contentEl.empty();
  return modal.contentEl;
}

// ---------------------------------------------------------------- book picker
export class BookSuggestModal extends FuzzySuggestModal<Book> {
  constructor(plugin: BookMindPlugin, private books: Book[], private onPick: (b: Book) => void) {
    super(plugin.app);
    this.setPlaceholder(t("chooseBook"));
    this.modalEl.setAttr("dir", dir());
  }
  getItems(): Book[] { return this.books; }
  getItemText(b: Book): string { return b.name + (b.author ? " — " + b.author : ""); }
  onChooseItem(b: Book): void { this.onPick(b); }
}

// ---------------------------------------------------------------- metadata fetch
export class FetchModal extends Modal {
  private results: HTMLElement | null = null;
  constructor(private plugin: BookMindPlugin, private target: TFile | null) { super(plugin.app); }

  onOpen(): void {
    const el = prepare(this, t("fetchTitle"), "bm-fetch");
    const row = el.createDiv({ cls: "bm-search-row" });
    const input = row.createEl("input", { type: "text", attr: { placeholder: t("fetchPh"), dir: "auto" } });
    if (this.target) input.value = this.target.basename;
    const btn = row.createEl("button", { text: t("search"), cls: "mod-cta" });
    this.results = el.createDiv({ cls: "bm-results" });
    const go = () => void this.search(input.value);
    btn.addEventListener("click", go);
    input.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    window.setTimeout(() => input.focus(), 30);
  }

  private async search(q: string): Promise<void> {
    const box = this.results;
    if (!box || !q.trim()) return;
    box.empty();
    box.createDiv({ cls: "bm-muted", text: t("searching") });
    let list: MetadataResult[] = [];
    try { list = await searchBooks(q, this.plugin.data.settings.googleApiKey); }
    catch { box.empty(); box.createDiv({ cls: "bm-muted", text: t("fetchError") }); return; }
    box.empty();
    if (!list.length) { box.createDiv({ cls: "bm-muted", text: t("noResults") }); return; }
    for (const r of list) {
      const item = box.createDiv({ cls: "bm-result" });
      if (r.cover) item.createEl("img", { cls: "bm-result-cover", attr: { src: r.cover.replace("-L.jpg", "-M.jpg"), alt: "", loading: "lazy" } });
      else item.createDiv({ cls: "bm-result-cover is-empty", text: "📖" });
      const info = item.createDiv({ cls: "bm-result-info" });
      info.createDiv({ cls: "bm-result-title", text: r.title, attr: { dir: "auto" } });
      info.createDiv({ cls: "bm-muted", text: [r.author, r.year, r.pages ? t("pagesShort", { n: r.pages }) : "", r.source === "google" ? "Google" : "OpenLibrary"].filter(Boolean).join(" · "), attr: { dir: "auto" } });
      if (r.genre.length) info.createDiv({ cls: "bm-chips-inline", text: r.genre.join(" · ") });
      const b = item.createEl("button", { text: this.target ? t("updateNote") : t("createNote"), cls: "mod-cta" });
      b.addEventListener("click", async () => {
        this.close();
        if (this.target) await this.plugin.fillBook(this.target, r); else await this.plugin.createBookFromMetadata(r);
      });
    }
  }
  onClose(): void { this.contentEl.empty(); }
}

// ---------------------------------------------------------------- finish session
export class StopSessionModal extends Modal {
  constructor(private plugin: BookMindPlugin, private book: Book, private startPage: number, private minutes: number, private notes: string) { super(plugin.app); }
  onOpen(): void {
    const el = prepare(this, t("stopTitle"));
    el.createDiv({ cls: "bm-modal-sub", text: this.book.name + " · " + t("startedAtPage", { page: this.startPage }) });
    let end = this.book.current, mins = this.minutes, notes = this.notes;
    new Setting(el).setName(t("endPage")).addText(c => {
      c.inputEl.type = "number"; c.inputEl.min = "0";
      if (this.book.pages) c.inputEl.max = String(this.book.pages);
      c.setValue(String(end)).onChange(v => (end = Number(v) || 0));
      window.setTimeout(() => { c.inputEl.focus(); c.inputEl.select(); }, 30);
    });
    new Setting(el).setName(t("minutes")).addText(c => { c.inputEl.type = "number"; c.inputEl.min = "0"; c.setValue(String(mins)).onChange(v => (mins = Number(v) || 0)); });
    new Setting(el).setName(t("sessionNotes")).addTextArea(c => { c.setValue(notes).onChange(v => (notes = v)); c.inputEl.rows = 3; c.inputEl.setAttr("dir", "auto"); });
    new Setting(el)
      .addButton(b => b.setButtonText(t("discard")).setWarning().onClick(async () => { this.close(); await this.plugin.discardSession(); }))
      .addButton(b => b.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton(b => b.setButtonText(t("save")).setCta().onClick(async () => { this.close(); await this.plugin.logSession(this.book, Math.max(0, end), Math.max(0, mins), notes.trim()); }));
  }
  onClose(): void { this.contentEl.empty(); }
}

// ---------------------------------------------------------------- page update
export class PageModal extends Modal {
  constructor(private plugin: BookMindPlugin, private book: Book) { super(plugin.app); }
  onOpen(): void {
    const el = prepare(this, t("updatePageTitle", { book: this.book.name }));
    let page = this.book.current;
    const submit = async () => { this.close(); await this.plugin.updatePage(this.book, Math.max(0, page)); };
    new Setting(el).setName(t("endPage")).addText(c => {
      c.inputEl.type = "number";
      c.setValue(String(page)).onChange(v => (page = Number(v) || 0));
      c.inputEl.addEventListener("keydown", e => { if (e.key === "Enter") void submit(); });
      window.setTimeout(() => { c.inputEl.focus(); c.inputEl.select(); }, 30);
    });
    new Setting(el).addButton(b => b.setButtonText(t("save")).setCta().onClick(submit));
  }
  onClose(): void { this.contentEl.empty(); }
}

// ---------------------------------------------------------------- mood & impact
export class MoodModal extends Modal {
  constructor(private plugin: BookMindPlugin, private book: Book) { super(plugin.app); }
  onOpen(): void {
    const el = prepare(this, t("moodModalTitle", { book: this.book.name }));
    let mood = this.book.mood, impact = this.book.impact || 7;
    el.createDiv({ cls: "bm-field-label", text: t("moodLabel") });
    const chips = el.createDiv({ cls: "bm-chips" });
    const paint = () => chips.querySelectorAll(".bm-chip").forEach(c => c.toggleClass("is-active", (c as HTMLElement).dataset.mood === mood));
    for (const m of MOODS) {
      const c = chips.createEl("button", { cls: "bm-chip", text: moodLabel(m) });
      c.dataset.mood = m;
      c.addEventListener("click", () => { mood = mood === m ? "" : m; paint(); });
    }
    paint();
    const val = el.createDiv({ cls: "bm-field-label" });
    const showVal = () => val.setText(t("impactLabel") + ": " + impact);
    showVal();
    new Setting(el).addSlider(s => s.setLimits(1, 10, 1).setValue(impact).setDynamicTooltip().onChange(v => { impact = v; showVal(); }));
    new Setting(el)
      .addButton(b => b.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton(b => b.setButtonText(t("save")).setCta().onClick(async () => { this.close(); await this.plugin.saveMood(this.book.path, mood, impact); }));
  }
  onClose(): void { this.contentEl.empty(); }
}

// ---------------------------------------------------------------- stalled-book nudge
export class NudgeModal extends Modal {
  constructor(private plugin: BookMindPlugin, private book: Book, private idle: number) { super(plugin.app); }
  onOpen(): void {
    const el = prepare(this, t("stalledTitle"));
    el.createEl("p", { text: t("stalledText", { book: this.book.name, n: this.idle }) });
    new Setting(el)
      .addButton(b => b.setButtonText(t("snooze")).onClick(async () => { this.close(); await this.plugin.snooze(this.book.path); }))
      .addButton(b => b.setButtonText(t("markDropped")).setWarning().onClick(async () => { this.close(); await this.plugin.setStatus(this.book.path, "dropped"); }))
      .addButton(b => b.setButtonText(t("continueReading")).setCta().onClick(async () => { this.close(); this.plugin.openBook(this.book.path); await this.plugin.startSession(this.book); }));
  }
  onClose(): void { this.contentEl.empty(); }
}

// ---------------------------------------------------------------- concept auto-linker
export class LinkModal extends Modal {
  constructor(private plugin: BookMindPlugin, private file: TFile) { super(plugin.app); }
  async onOpen(): Promise<void> {
    const el = prepare(this, t("linkTitle", { book: this.file.basename }));
    const P = this.plugin;
    const books = P.library.books();
    const folder = P.data.settings.conceptsFolder.trim().replace(/\/+$/, "");
    const extra = folder ? P.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + "/")).map(f => f.basename) : [];
    // a concept qualifies when another book carries it (idea / genre), or it is a note in the concepts folder
    const candidates = collectConcepts(books.filter(b => b.path !== this.file.path), extra);
    const text = await P.app.vault.read(this.file);
    const sugg = suggestLinks(text, candidates, this.file.basename);
    if (!sugg.length) { el.createDiv({ cls: "bm-muted", text: t("linkNone") }); return; }
    const chosen = new Set<Suggestion>(sugg);
    const list = el.createDiv({ cls: "bm-link-list" });
    for (const s of sugg) {
      const row = list.createEl("label", { cls: "bm-link-row" });
      const cb = row.createEl("input", { type: "checkbox" });
      cb.checked = true;
      cb.addEventListener("change", () => { if (cb.checked) chosen.add(s); else chosen.delete(s); });
      const body = row.createDiv();
      body.createDiv({ cls: "bm-link-concept", text: "[[" + s.concept + "]]" });
      body.createDiv({ cls: "bm-muted", text: "…" + s.context + "…", attr: { dir: "auto" } });
    }
    new Setting(el).addButton(b => b.setButtonText(t("linkApply")).setCta().onClick(async () => {
      const pick = sugg.filter(s => chosen.has(s));
      await P.app.vault.process(this.file, c => applyLinks(c, pick));
      new Notice(t("linked", { n: pick.length }));
      this.close();
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}

// ---------------------------------------------------------------- flashcards
export class FlashcardModal extends Modal {
  constructor(private plugin: BookMindPlugin, private book: Book | null) { super(plugin.app); }
  onOpen(): void {
    const el = prepare(this, t("addFlashcard"));
    const books = this.plugin.library.books();
    let path = this.book?.path || books.find(b => b.state === "reading")?.path || books[0]?.path || "";
    let q = "", a = "";
    new Setting(el).setName(t("bookLabel")).addDropdown(d => { for (const b of books) d.addOption(b.path, b.name); d.setValue(path).onChange(v => (path = v)); });
    new Setting(el).setName(t("question")).addTextArea(c => { c.inputEl.rows = 2; c.inputEl.setAttr("dir", "auto"); c.onChange(v => (q = v)); });
    new Setting(el).setName(t("answer")).addTextArea(c => { c.inputEl.rows = 3; c.inputEl.setAttr("dir", "auto"); c.onChange(v => (a = v)); });
    new Setting(el).addButton(b => b.setButtonText(t("save")).setCta().onClick(async () => {
      const book = books.find(x => x.path === path);
      if (!book || !q.trim() || !a.trim()) return;
      this.close();
      await this.plugin.addFlashcard(book, q, a);
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}

// ---------------------------------------------------------------- quote cards
export class QuoteCardModal extends Modal {
  private theme: CardTheme = "ink";
  constructor(private plugin: BookMindPlugin, private quote: string, private attribution: string) { super(plugin.app); }
  onOpen(): void {
    const el = prepare(this, t("cardTitle"), "bm-card-modal");
    const canvas = el.createEl("canvas", { cls: "bm-card-canvas" });
    const draw = () => drawQuoteCard(canvas, this.quote, this.attribution ? "— " + this.attribution : "", this.theme);
    const themes = el.createDiv({ cls: "bm-chips" });
    for (const th of THEMES) {
      const c = themes.createEl("button", { cls: "bm-chip bm-theme-" + th + (th === this.theme ? " is-active" : ""), text: tk("theme_" + th) });
      c.addEventListener("click", () => { this.theme = th; themes.querySelectorAll(".bm-chip").forEach(x => x.removeClass("is-active")); c.addClass("is-active"); draw(); });
    }
    draw();
    new Setting(el)
      .addButton(b => b.setButtonText(t("copyImage")).onClick(async () => {
        const blob = await canvasToPng(canvas);
        try {
          if (!blob || typeof ClipboardItem === "undefined") throw new Error("unsupported");
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          new Notice(t("copied"));
        } catch { new Notice(t("copyFailed")); }
      }))
      .addButton(b => b.setButtonText(t("savePng")).setCta().onClick(async () => {
        const blob = await canvasToPng(canvas);
        if (!blob) return;
        const folder = normalizePath(this.plugin.data.settings.cardsFolder.trim() || "Quote Cards");
        await this.plugin.ensureFolder(folder);
        const base = safeName(this.attribution.split(" · ").pop() || "Quote").slice(0, 60) || "Quote";
        const path = normalizePath(folder + "/" + base + " - " + highlightId(this.quote) + "-" + this.theme + ".png");
        const existing = this.plugin.app.vault.getAbstractFileByPath(path);
        const buf = await blob.arrayBuffer();
        if (existing instanceof TFile) await this.plugin.app.vault.modifyBinary(existing, buf); else await this.plugin.app.vault.createBinary(path, buf);
        new Notice(t("cardSaved", { path }));
      }));
  }
  onClose(): void { this.contentEl.empty(); }
}
