/** "Spotify Wrapped for books": monthly or yearly Markdown summary written into the vault. */
import { normalizePath, Notice, TFile } from "obsidian";
import type BookMindPlugin from "../main";
import { range, todayKey, fmt1 } from "../core/dates";
import { computeVelocity } from "../core/velocity";
import { goalPace, moodStats } from "../core/insights";
import { strength } from "../core/srs";
import { formatLabel, moodLabel, niceDate, periodLabel, t } from "../i18n";

const esc = (s: string) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function periodBounds(period: string): { from: string; to: string } {
  const today = todayKey();
  if (period.length === 4) return { from: period + "-01-01", to: [period + "-12-31", today].sort()[0] };
  const d = new Date(period + "-01T00:00:00");
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  const last = period + "-" + String(d.getDate()).padStart(2, "0");
  return { from: period + "-01", to: last > today ? today : last };
}

function top(counts: Record<string, number>): [string, number] | null {
  const e = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return e && e[1] > 0 ? e : null;
}

export function buildWrapUp(plugin: BookMindPlugin, period: string): string {
  const books = plugin.library.books();
  const { from, to } = periodBounds(period);
  const days = range(from, to);
  const inRange = (d: string) => d >= from && d <= to;

  const perDay: Record<string, number> = {};
  const byAuthor: Record<string, number> = {}, byGenre: Record<string, number> = {}, byFormat: Record<string, number> = {};
  let pages = 0, sessions = 0;
  for (const b of books) {
    let bp = 0;
    for (const [d, p] of Object.entries(b.daily)) if (inRange(d)) { bp += p; perDay[d] = (perDay[d] || 0) + p; }
    sessions += b.sessions.filter(s => inRange(s.date)).length;
    if (!bp) continue;
    pages += bp;
    if (b.author) byAuthor[b.author] = (byAuthor[b.author] || 0) + bp;
    for (const g of b.genre.slice(0, 1)) byGenre[g] = (byGenre[g] || 0) + bp;
    byFormat[b.format] = (byFormat[b.format] || 0) + bp;
  }
  const hours = days.reduce((a, d) => a + plugin.rj.hours(d, plugin.data.standaloneHours), 0);
  const finished = books.filter(b => b.state === "finished" && inRange(b.finished));
  const touched = new Set(books.filter(b => Object.keys(b.daily).some(inRange) || inRange(b.finished)).map(b => b.path));
  const best = top(perDay);
  const v = computeVelocity(books.map(b => ({ ...b, sessions: b.sessions.filter(s => inRange(s.date)) })));
  const moods = moodStats(finished);
  const quotes = plugin.library.highlights
    .filter(h => touched.has(h.bookPath))
    .sort((a, b) => strength(plugin.data.reviews[b.id]) - strength(plugin.data.reviews[a.id]) || a.text.length - b.text.length)
    .slice(0, 3);

  const yearly = period.length === 4;
  const L: string[] = [
    "---", "type: reading-wrapup", "period: \"" + period + "\"", "pages: " + pages, "hours: " + fmt1(hours), "finished: " + finished.length, "generated: " + todayKey(), "---", "",
    "# " + (yearly ? t("rYearTitle", { period: periodLabel(period) }) : t("rMonthTitle", { period: periodLabel(period) })), "",
    "## 📊 " + t("rNumbers"), "", "| | |", "|---|---:|",
    "| " + t("rPages") + " | **" + pages + "** |",
    "| " + t("rHours") + " | **" + fmt1(hours) + "** |",
    "| " + t("rFinished") + " | **" + finished.length + "** |",
    "| " + t("rSessions") + " | " + sessions + " |",
  ];
  if (best) L.push("| " + t("rBestDay") + " | " + niceDate(best[0]) + " — " + best[1] + " |");
  if (v.overall.pph) L.push("| " + t("rSpeed") + " | " + Math.round(v.overall.pph) + " p/h |");
  const ta = top(byAuthor), tg = top(byGenre);
  if (ta) L.push("| " + t("rTopAuthor") + " | " + esc(ta[0]) + " |");
  if (tg) L.push("| " + t("rTopGenre") + " | " + esc(tg[0]) + " |");
  L.push("");

  L.push("## 📚 " + t("rFinishedList"), "");
  if (finished.length) {
    L.push("| " + [t("colBook"), t("colAuthor"), t("colPages"), t("colMood"), t("colImpact")].join(" | ") + " |", "|---|---|---:|---|---:|");
    for (const b of finished) L.push("| [[" + b.name + "]] | " + esc(b.author) + " | " + (b.pages || "") + " | " + (b.mood ? moodLabel(b.mood) : "") + " | " + (b.impact || "") + " |");
  } else L.push("- " + t("rNone"));
  L.push("");

  if (Object.keys(byFormat).length > 1) {
    L.push("## 🎧 " + t("rFormats"), "");
    for (const [f, p] of Object.entries(byFormat).sort((a, b) => b[1] - a[1])) L.push("- " + formatLabel(f) + ": " + p + " (" + Math.round((p / Math.max(1, pages)) * 100) + "%)");
    L.push("");
  }
  if (Object.keys(moods.moods).length) {
    L.push("## 🎭 " + t("rMoods"), "");
    for (const [m, n] of Object.entries(moods.moods).sort((a, b) => b[1] - a[1])) L.push("- " + moodLabel(m) + " × " + n);
    L.push("");
  }
  L.push("## ✨ " + t("rQuotes"), "");
  if (quotes.length) for (const q of quotes) L.push("> " + q.text.replace(/\n/g, "\n> "), "> — *[[" + q.bookName + "]]*", "");
  else L.push("- " + t("rNone"), "");

  const pace = goalPace(books, plugin.yearGoal(), todayKey());
  if (pace && (yearly || period.startsWith(todayKey().slice(0, 4)))) {
    L.push("## 🎯 " + t("rGoal"), "", "- " + t("goalProgress", { done: pace.finished, goal: pace.goal, year: todayKey().slice(0, 4) }), "");
  }
  L.push("*" + t("rGenerated", { date: todayKey() }) + "*", "");
  return L.join("\n");
}

export async function exportWrapUp(plugin: BookMindPlugin, period: string): Promise<void> {
  await plugin.library.index();
  const folder = normalizePath(plugin.data.settings.reportsFolder.trim() || "Reports");
  await plugin.ensureFolder(folder);
  const path = normalizePath(folder + "/Reading Wrap-up " + period + ".md");
  const body = buildWrapUp(plugin, period);
  const ex = plugin.app.vault.getAbstractFileByPath(path);
  let file: TFile;
  if (ex instanceof TFile) { await plugin.app.vault.modify(ex, body); file = ex; } else file = await plugin.app.vault.create(path, body);
  new Notice(t("rSaved", { path }));
  await plugin.app.workspace.getLeaf(true).openFile(file);
}
