import { ItemView, TFile, setIcon, type WorkspaceLeaf } from "obsidian";
import type BookMindPlugin from "../main";
import type { Book, BookStatus, Grade, Highlight, Tab } from "../types";
import { dir, formatLabel, getLang, moodLabel, t, tk } from "../i18n";
import type { I18nKey } from "../i18n";
import { progressPct, STATUSES } from "../core/books";
import { computeVelocity, estimateFinish, formatDuration } from "../core/velocity";
import { dueToday, highlightOfDay } from "../core/srs";
import { goalPace, moodStats } from "../core/insights";
import { groupSeries } from "../core/series";
import { collectConcepts, conceptGraph } from "../core/concepts";
import { todayKey } from "../core/dates";
import { exportWrapUp } from "../reports/wrapUp";
import { FetchModal, FlashcardModal, LinkModal, MoodModal, PageModal } from "./Modals";

export const VIEW_TYPE = "book-mind-view";

const units = () => ({ h: t("unitH"), m: t("unitM") });

function button(parent: HTMLElement, o: { text?: string; icon?: string; cls?: string; tip?: string; onClick: (e: MouseEvent) => void }): HTMLButtonElement {
  const b = parent.createEl("button", { cls: "bm-btn" + (o.cls ? " " + o.cls : "") });
  if (o.icon) setIcon(b.createSpan({ cls: "bm-btn-icon" }), o.icon);
  if (o.text) b.createSpan({ text: o.text });
  if (o.tip) b.setAttr("aria-label", o.tip);
  b.addEventListener("click", e => { e.stopPropagation(); o.onClick(e); });
  return b;
}

function bar(parent: HTMLElement, pct: number, cls = ""): void {
  parent.createDiv({ cls: "bm-bar" + (cls ? " " + cls : "") }).createDiv({ cls: "bm-bar-fill" }).style.width = Math.max(0, Math.min(100, pct)) + "%";
}

function card(parent: HTMLElement, title: string, icon = ""): HTMLElement {
  const c = parent.createDiv({ cls: "bm-card" });
  c.createDiv({ cls: "bm-card-title", text: (icon ? icon + " " : "") + title });
  return c;
}

function cover(plugin: BookMindPlugin, parent: HTMLElement, b: Book, cls = "bm-cover"): void {
  const src = /^https?:\/\//i.test(b.cover) ? b.cover : (() => {
    // Accept a plain vault path or a wikilink/embed such as "![[covers/x.png|200]]".
    const link = b.cover.replace(/^!?\[\[|\]\]$/g, "").split("|")[0].trim();
    const f = plugin.app.metadataCache.getFirstLinkpathDest(link, b.path) ?? plugin.app.vault.getAbstractFileByPath(link);
    return f instanceof TFile ? plugin.app.vault.getResourcePath(f) : "";
  })();
  if (src) { parent.createEl("img", { cls, attr: { src, alt: "", loading: "lazy" } }); return; }
  let h = 0;
  for (const c of b.name) h = (h * 31 + c.codePointAt(0)!) % 360;
  const el = parent.createDiv({ cls: cls + " is-generated", text: b.name.slice(0, 2) });
  el.style.background = "linear-gradient(150deg, hsl(" + h + ",48%,38%), hsl(" + ((h + 32) % 360) + ",54%,22%))";
}

function prepareRoot(root: HTMLElement): void {
  root.empty();
  root.addClass("bm-root");
  root.setAttr("dir", dir());
  root.toggleClass("bm-rtl", getLang() === "ar");
}

export class BookMindView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: BookMindPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return t("appName"); }
  getIcon(): string { return "brain"; }
  async onOpen(): Promise<void> { this.plugin.renderers.add(this); this.render(); }
  async onClose(): Promise<void> { this.plugin.renderers.delete(this); }
  render(): void { renderDashboard(this.plugin, this.contentEl); }
}

export function renderDashboard(plugin: BookMindPlugin, root: HTMLElement): void {
  // keep a half-typed quick note across re-renders
  const draft = (root.querySelector(".bm-quicknote") as HTMLInputElement | null)?.value || "";
  const scroll = root.scrollTop;
  prepareRoot(root);
  root.addClass("bm-dashboard");

  const head = root.createDiv({ cls: "bm-head" });
  const titles = head.createDiv({ cls: "bm-titles" });
  titles.createDiv({ cls: "bm-title", text: "🧠 " + t("appName") });
  titles.createDiv({ cls: "bm-tagline", text: t("tagline") });
  const acts = head.createDiv({ cls: "bm-head-actions" });
  const sw = acts.createDiv({ cls: "bm-lang", attr: { role: "group", "aria-label": t("langToggle") } });
  for (const [l, label] of [["en", "EN"], ["ar", "عربي"]] as const) {
    const b = sw.createEl("button", { cls: "bm-lang-opt" + (getLang() === l ? " is-active" : ""), text: label });
    b.addEventListener("click", () => { if (getLang() !== l) void plugin.toggleLang(); });
  }
  button(acts, { icon: "plus", cls: "bm-icon-btn mod-cta", tip: t("fetchBook"), onClick: () => new FetchModal(plugin, null).open() });
  button(acts, { icon: "settings", cls: "bm-icon-btn", tip: t("settings"), onClick: () => plugin.openSettings() });

  const tabs = root.createDiv({ cls: "bm-tabs", attr: { role: "tablist" } });
  const cur = plugin.data.ui.tab;
  const defs: [Tab, I18nKey, string][] = [["today", "tabToday", "sun"], ["shelf", "tabShelf", "library"], ["series", "tabSeries", "layers"], ["insights", "tabInsights", "sparkles"]];
  for (const [id, key, icon] of defs) {
    const b = button(tabs, { text: t(key), icon, cls: "bm-tab" + (cur === id ? " is-active" : ""), onClick: () => { plugin.data.ui.tab = id; void plugin.save(); plugin.refresh(); } });
    b.setAttr("role", "tab");
    b.setAttr("aria-selected", String(cur === id));
  }

  const body = root.createDiv({ cls: "bm-body" });
  if (cur === "today") renderToday(plugin, body, draft);
  else if (cur === "shelf") renderShelf(plugin, body);
  else if (cur === "series") renderSeries(plugin, body);
  else renderInsights(plugin, body);
  root.scrollTop = scroll;
}

// ---------------------------------------------------------------- today
function renderSession(plugin: BookMindPlugin, body: HTMLElement, draft = ""): void {
  const s = plugin.data.session;
  if (!s) return;
  const b = plugin.library.book(s.bookPath);
  const c = body.createDiv({ cls: "bm-card bm-session" + (s.pausedAt ? " is-paused" : "") });
  const top = c.createDiv({ cls: "bm-session-top" });
  if (b) cover(plugin, top, b, "bm-cover bm-cover-sm");
  const info = top.createDiv({ cls: "bm-session-info" });
  info.createDiv({ cls: "bm-card-title", text: "⏱ " + t("sessionTitle") });
  info.createDiv({ cls: "bm-session-book", text: b ? b.name : s.bookPath, attr: { dir: "auto" } });
  info.createDiv({ cls: "bm-muted", text: t("startedAtPage", { page: s.startPage }) });
  c.createDiv({ cls: "bm-clock", text: plugin.clockText() });
  const row = c.createDiv({ cls: "bm-row" });
  button(row, { text: s.pausedAt ? t("resume") : t("pause"), icon: s.pausedAt ? "play" : "pause", onClick: () => plugin.togglePause() });
  button(row, { text: t("stop"), icon: "square", cls: "mod-cta", onClick: () => plugin.finishSessionPrompt() });
  const input = c.createEl("input", { cls: "bm-quicknote", type: "text", attr: { placeholder: t("quickNotePh"), dir: "auto" } });
  input.value = draft;
  input.addEventListener("keydown", e => { if (e.key === "Enter" && input.value.trim()) { const v = input.value; input.value = ""; void plugin.addSessionNote(v); } });
  if (s.notes.length) { const ul = c.createEl("ul", { cls: "bm-notes" }); for (const n of s.notes) ul.createEl("li", { text: n, attr: { dir: "auto" } }); }
}

function renderGoal(plugin: BookMindPlugin, body: HTMLElement): void {
  const p = goalPace(plugin.library.books(), plugin.yearGoal(), todayKey());
  const c = card(body, t("goalTitle"), "🎯");
  if (!p) { c.createDiv({ cls: "bm-muted", text: t("goalNone") }); return; }
  const line = c.createDiv({ cls: "bm-goal-line" });
  line.createSpan({ cls: "bm-goal-num", text: t("goalProgress", { done: p.finished, goal: p.goal, year: todayKey().slice(0, 4) }) });
  if (!p.remaining) line.createSpan({ cls: "bm-pill is-good", text: t("goalDone") });
  else if (p.delta >= 0.5) line.createSpan({ cls: "bm-pill is-good", text: t("goalAhead", { n: Math.floor(p.delta) }) });
  else if (p.delta <= -0.5) line.createSpan({ cls: "bm-pill is-warn", text: t("goalBehind", { n: Math.ceil(-p.delta) }) });
  bar(c, (p.finished / p.goal) * 100, "is-goal");
  if (p.remaining) c.createDiv({ cls: "bm-muted", text: p.extraPerDay > 0 ? t("goalExtra", { n: p.extraPerDay, cur: p.currentPerDay, req: p.requiredPerDay }) : t("goalOnTrack", { req: p.requiredPerDay }) });
}

function renderStalled(plugin: BookMindPlugin, body: HTMLElement): void {
  for (const { book, idle } of plugin.stalled().slice(0, 2)) {
    const c = body.createDiv({ cls: "bm-card bm-nudge" });
    c.createDiv({ cls: "bm-card-title", text: "⏸️ " + t("stalledTitle") });
    c.createDiv({ text: t("stalledText", { book: book.name, n: idle }) });
    const row = c.createDiv({ cls: "bm-row" });
    button(row, { text: t("continueReading"), icon: "play", cls: "mod-cta", onClick: () => { plugin.openBook(book.path); void plugin.startSession(book); } });
    button(row, { text: t("markDropped"), icon: "x", onClick: () => plugin.setStatus(book.path, "dropped") });
    button(row, { text: t("snooze"), icon: "alarm-clock", onClick: () => plugin.snooze(book.path) });
  }
}

function highlightCard(plugin: BookMindPlugin, parent: HTMLElement, h: Highlight, gradable: boolean): void {
  const c = parent.createDiv({ cls: "bm-quote" });
  c.createDiv({ cls: "bm-quote-text", text: h.text, attr: { dir: "auto" } });
  const meta = c.createDiv({ cls: "bm-quote-meta" });
  const link = meta.createEl("a", { text: t("fromBook", { book: h.bookName }), href: "#" });
  link.addEventListener("click", e => { e.preventDefault(); plugin.openBook(h.bookPath); });
  button(meta, { icon: "image", cls: "bm-icon-btn", tip: t("quoteCard"), onClick: () => plugin.openQuoteCard(h.text, plugin.library.book(h.bookPath)) });
  if (!gradable) return;
  const grades = c.createDiv({ cls: "bm-grades" });
  const g: [Grade, I18nKey][] = [[0, "forgot"], [1, "hard"], [2, "good"], [3, "easy"]];
  for (const [grade, key] of g) button(grades, { text: t(key), cls: "bm-grade bm-grade-" + grade, onClick: () => plugin.gradeHighlight(h, grade) });
}

export function renderHighlights(plugin: BookMindPlugin, body: HTMLElement): void {
  const all = plugin.library.highlights;
  const today = todayKey();
  const due = dueToday(all, plugin.data.reviews, today, plugin.data.reviewedToday.ids, plugin.data.settings.dailyHighlights);
  const c = card(body, t("highlightsTitle"), "💡");
  if (!all.length) { c.createDiv({ cls: "bm-muted", text: t("noHighlights") }); return; }
  if (due.length) {
    c.createDiv({ cls: "bm-muted", text: t("highlightsDue", { n: due.length }) });
    for (const h of due) highlightCard(plugin, c, h, true);
    return;
  }
  c.createDiv({ cls: "bm-muted", text: t("allCaught") });
  const h = highlightOfDay(all, today);
  if (h) highlightCard(plugin, c, h, false);
}

export function bookCard(plugin: BookMindPlugin, parent: HTMLElement, b: Book, velocity = computeVelocity(plugin.library.books())): void {
  const c = parent.createDiv({ cls: "bm-book" });
  cover(plugin, c, b);
  const info = c.createDiv({ cls: "bm-book-info" });
  const title = info.createDiv({ cls: "bm-book-title", text: b.name, attr: { dir: "auto" } });
  title.addEventListener("click", () => plugin.openBook(b.path));
  if (b.author) info.createDiv({ cls: "bm-muted", text: b.author, attr: { dir: "auto" } });
  if (b.series) info.createDiv({ cls: "bm-chips-inline", text: "📚 " + b.series + (b.volume ? " · " + t("vol") + " " + b.volume : "") });
  if (b.pages) {
    bar(info, progressPct(b));
    info.createDiv({ cls: "bm-muted", text: t("pageOf", { cur: b.current, total: b.pages }) + " · " + progressPct(b) + "%" });
  }
  if (b.state === "reading" || b.state === "paused") {
    const e = estimateFinish(b, velocity);
    if (e) {
      const basis = e.basis === "book" ? t("etaBasisBook") : e.basis === "genre" ? t("etaBasisGenre", { genre: b.genre[0] }) : e.basis === "format" ? t("etaBasisFormat", { format: formatLabel(b.format) }) : t("etaBasisOverall");
      info.createDiv({ cls: "bm-eta", text: t("etaLeft", { time: formatDuration(e.hours, units()) }) + " · " + basis });
    } else if (b.pages) info.createDiv({ cls: "bm-muted bm-eta-none", text: t("etaUnknown") });
  }
  const acts = info.createDiv({ cls: "bm-row" });
  if (b.state !== "finished") {
    if (!plugin.data.session) button(acts, { text: t("startSession"), icon: "play", cls: "mod-cta", onClick: () => plugin.startSession(b) });
    button(acts, { text: t("updatePage"), icon: "bookmark", onClick: () => new PageModal(plugin, b).open() });
  } else if (!b.mood) button(acts, { text: t("rateMood"), icon: "smile", onClick: () => new MoodModal(plugin, b).open() });
}

function renderReading(plugin: BookMindPlugin, body: HTMLElement): void {
  const books = plugin.library.books();
  const reading = books.filter(b => b.state === "reading" && b.path !== plugin.data.session?.bookPath);
  const c = card(body, t("statusReading"), "📖");
  if (!reading.length && !plugin.data.session) { c.createDiv({ cls: "bm-muted", text: t("noReading") }); return; }
  const v = computeVelocity(books);
  for (const b of reading) bookCard(plugin, c, b, v);
}

function renderToday(plugin: BookMindPlugin, body: HTMLElement, draft: string): void {
  renderSession(plugin, body, draft);
  renderStalled(plugin, body);
  renderReading(plugin, body);
  renderHighlights(plugin, body);
  renderGoal(plugin, body);
}

// ---------------------------------------------------------------- shelf
const STATUS_KEY: Record<BookStatus, I18nKey> = { reading: "statusReading", want: "statusWant", paused: "statusPaused", finished: "statusFinished", dropped: "statusDropped" };

function renderShelf(plugin: BookMindPlugin, body: HTMLElement): void {
  const books = plugin.library.books();
  if (!books.length) {
    const e = body.createDiv({ cls: "bm-empty", text: t("emptyShelf") });
    button(e, { text: t("fetchBook"), icon: "plus", cls: "mod-cta", onClick: () => new FetchModal(plugin, null).open() });
    return;
  }
  const v = computeVelocity(books);
  for (const st of STATUSES) {
    const list = books.filter(b => b.state === st).sort((a, b) => (b.lastActivity || "").localeCompare(a.lastActivity || ""));
    if (!list.length) continue;
    const det = body.createEl("details", { cls: "bm-shelf" });
    if (st === "reading" || st === "want") det.open = true;
    det.createEl("summary", { text: t(STATUS_KEY[st]) + " · " + list.length });
    const grid = det.createDiv({ cls: st === "finished" || st === "dropped" ? "bm-cover-grid" : "bm-book-list" });
    for (const b of list) {
      if (st === "finished" || st === "dropped") {
        const tile = grid.createDiv({ cls: "bm-tile", attr: { "aria-label": b.name + (b.author ? " — " + b.author : "") + (b.impact ? " · " + b.impact + "/10" : "") } });
        cover(plugin, tile, b, "bm-cover bm-cover-tile");
        tile.addEventListener("click", () => plugin.openBook(b.path));
      } else bookCard(plugin, grid, b, v);
    }
  }
}

// ---------------------------------------------------------------- series
export function renderSeries(plugin: BookMindPlugin, body: HTMLElement): void {
  const series = groupSeries(plugin.library.books());
  if (!series.length) { body.createDiv({ cls: "bm-empty", text: t("noSeries") }); return; }
  for (const s of series) {
    const c = card(body, s.name, "📚");
    c.createDiv({ cls: "bm-muted", text: t("seriesProgress", { done: s.finished, total: s.total }) + " · " + s.pct + "%" });
    bar(c, s.pct, "is-series");
    const strip = c.createDiv({ cls: "bm-volumes" });
    for (const b of s.books) {
      const v = strip.createDiv({ cls: "bm-vol is-" + b.state, text: b.volume ? String(b.volume) : "•", attr: { "aria-label": b.name + " · " + t(STATUS_KEY[b.state]) } });
      v.addEventListener("click", () => plugin.openBook(b.path));
    }
    for (const m of s.missing.slice(0, 20)) strip.createDiv({ cls: "bm-vol is-missing", text: String(m) });
    if (s.next) c.createDiv({ text: t("seriesNext", { book: s.next.name }) });
    if (s.missing.length) c.createDiv({ cls: "bm-muted", text: t("seriesMissing", { list: s.missing.slice(0, 12).join(", ") + (s.missing.length > 12 ? "…" : "") }) });
  }
}

// ---------------------------------------------------------------- insights
function rateRows(parent: HTMLElement, rows: [string, number, number][]): void {
  const max = Math.max(1, ...rows.map(r => r[1]));
  for (const [label, pph, hours] of rows) {
    const r = parent.createDiv({ cls: "bm-rate-row" });
    r.createDiv({ cls: "bm-rate-label", text: label });
    bar(r, (pph / max) * 100);
    r.createDiv({ cls: "bm-rate-val", text: Math.round(pph) + " p/h", attr: { "aria-label": Math.round(hours * 10) / 10 + " h" } });
  }
}

function renderInsights(plugin: BookMindPlugin, body: HTMLElement): void {
  const books = plugin.library.books();
  const v = computeVelocity(books);
  const sp = card(body, t("speedTitle"), "⚡");
  if (!v.overall.pph) sp.createDiv({ cls: "bm-muted", text: t("speedEmpty") });
  else {
    sp.createDiv({ text: t("overallSpeed", { pph: Math.round(v.overall.pph), h: Math.round(v.overall.hours * 10) / 10 }) });
    const f = Object.entries(v.byFormat);
    if (f.length) { sp.createDiv({ cls: "bm-sub", text: t("byFormat") }); rateRows(sp, f.map(([k, r]) => [formatLabel(k), r.pph, r.hours])); }
    const g = Object.entries(v.byGenre).sort((a, b) => b[1].hours - a[1].hours).slice(0, 6);
    if (g.length) { sp.createDiv({ cls: "bm-sub", text: t("byGenre") }); rateRows(sp, g.map(([k, r]) => [k, r.pph, r.hours])); }
  }

  const ms = moodStats(books);
  const mc = card(body, t("moodTitle"), "🎭");
  if (!Object.keys(ms.moods).length && !ms.topImpact.length) mc.createDiv({ cls: "bm-muted", text: t("noMood") });
  else {
    const chips = mc.createDiv({ cls: "bm-chips" });
    for (const [m, n] of Object.entries(ms.moods).sort((a, b) => b[1] - a[1])) chips.createSpan({ cls: "bm-chip is-static", text: moodLabel(m) + " · " + n });
    if (ms.impactByGenre.length) { mc.createDiv({ cls: "bm-sub", text: t("impactByGenre") }); rateRowsImpact(mc, ms.impactByGenre); }
    if (ms.topImpact.length) {
      mc.createDiv({ cls: "bm-sub", text: t("topImpact") });
      for (const b of ms.topImpact) { const r = mc.createDiv({ cls: "bm-link-line", text: "★ " + b.impact + "/10 — " + b.name }); r.addEventListener("click", () => plugin.openBook(b.path)); }
    }
  }

  renderConcepts(plugin, body);

  const ac = card(body, t("actions"), "🧰");
  const row = ac.createDiv({ cls: "bm-row bm-wrap" });
  button(row, { text: t("wrapMonth"), icon: "calendar", onClick: () => exportWrapUp(plugin, todayKey().slice(0, 7)) });
  button(row, { text: t("wrapYear"), icon: "calendar-range", onClick: () => exportWrapUp(plugin, todayKey().slice(0, 4)) });
  button(row, { text: t("addFlashcard"), icon: "layers", onClick: () => new FlashcardModal(plugin, plugin.library.activeBook() || null).open() });
  button(row, { text: t("exportFlashcards"), icon: "download", onClick: () => plugin.exportFlashcards() });
  const active = plugin.app.workspace.getActiveFile();
  if (active) button(row, { text: t("suggestLinks"), icon: "link", onClick: () => new LinkModal(plugin, active).open() });
}

function rateRowsImpact(parent: HTMLElement, rows: { genre: string; avg: number; n: number }[]): void {
  for (const r of rows.slice(0, 6)) {
    const el = parent.createDiv({ cls: "bm-rate-row" });
    el.createDiv({ cls: "bm-rate-label", text: r.genre });
    bar(el, r.avg * 10, "is-impact");
    el.createDiv({ cls: "bm-rate-val", text: r.avg + "/10" });
  }
}

export function renderConcepts(plugin: BookMindPlugin, body: HTMLElement): void {
  const books = plugin.library.books();
  const c = card(body, t("conceptTitle"), "🔗");
  const graph = conceptGraph(books, collectConcepts(books, []), plugin.library.bodies, plugin.library.highlights).slice(0, 8);
  if (!graph.length) { c.createDiv({ cls: "bm-muted", text: t("conceptEmpty") }); return; }
  for (const g of graph) {
    const det = c.createEl("details", { cls: "bm-concept" });
    const sum = det.createEl("summary");
    sum.createSpan({ cls: "bm-concept-name", text: g.concept });
    sum.createSpan({ cls: "bm-muted", text: " · " + t("conceptBooks", { n: g.books.length }) });
    const bl = det.createDiv({ cls: "bm-chips" });
    for (const b of g.books) { const ch = bl.createEl("button", { cls: "bm-chip", text: b.name }); ch.addEventListener("click", () => plugin.openBook(b.path)); }
    for (const q of g.quotes) det.createDiv({ cls: "bm-concept-quote", text: "“" + q.text + "” — " + q.bookName, attr: { dir: "auto" } });
  }
}

// ---------------------------------------------------------------- code block
/**
 * ```book-mind
 * highlights reading     ← any of: session | reading | highlights | goal | series | concepts
 * ```
 */
export function renderBlock(plugin: BookMindPlugin, el: HTMLElement, src: string): void {
  prepareRoot(el);
  el.addClass("bm-block");
  const words = src.toLowerCase().split(/[\s,]+/).filter(Boolean);
  for (const w of words.length ? words : ["reading", "highlights"]) {
    if (w === "session") renderSession(plugin, el);
    else if (w === "reading") renderReading(plugin, el);
    else if (w === "highlights") renderHighlights(plugin, el);
    else if (w === "goal") renderGoal(plugin, el);
    else if (w === "series") renderSeries(plugin, el);
    else if (w === "concepts") renderConcepts(plugin, el);
    else el.createDiv({ cls: "bm-muted", text: tk(w) });
  }
}
