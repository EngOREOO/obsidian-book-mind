/* Smoke test for Book Mind's pure core (no Obsidian runtime). Run: npm test */
import { parseBook } from "../src/core/books";
import { computeVelocity, estimateFinish, formatDuration } from "../src/core/velocity";
import { review, dueToday, highlightId, highlightOfDay } from "../src/core/srs";
import { groupSeries } from "../src/core/series";
import { stalledBooks, goalPace, moodStats, pagesInRange } from "../src/core/insights";
import { suggestLinks, applyLinks, conceptGraph, collectConcepts, conceptRegex } from "../src/core/concepts";
import { extractHighlights, extractFlashcards, insertUnderHeading, appendToSection } from "../src/core/notes";
import { addDays, todayKey } from "../src/core/dates";
import type { Highlight } from "../src/types";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const today = todayKey();
const d = (n: number) => addDays(today, -n);

// ---- books (Reading Journey schema, legacy + object checkpoints)
const dune = parseBook("Books/Dune.md", "Dune", {
  rj: "book", author: "Frank Herbert", pages: 600, start_page: 0, status: "reading", format: "paper", genre: ["Sci-Fi"],
  log: [d(20) + "|50", { date: d(10), page: 150 }, { date: d(2), page: 300 }],
  sessions: [
    { date: d(10), fromPage: 50, toPage: 150, pages: 100, hours: 2 },
    { date: d(2), fromPage: 150, toPage: 300, pages: 150, hours: 3 },
  ],
  quotes: ["Fear is the mind-killer.", { text: "The mystery of life isn't a problem to solve." }],
  ideas: ["Ecology", "Power"], series: "Dune", volume: 1, series_total: 6, bm_mood: "philosophical", bm_impact: 9,
}, d(2));
ok(dune.current === 300 && dune.state === "reading", "current page from checkpoints (legacy + object) → " + dune.current);
ok(dune.daily[d(20)] === 50 && dune.daily[d(10)] === 100 && dune.daily[d(2)] === 150, "pages per day via checkpoint deltas");
ok(dune.quotes.length === 2, "quotes accept strings and {text}");
ok(dune.lastActivity === d(2), "last activity = latest checkpoint");

const messiah = parseBook("Books/Dune Messiah.md", "Dune Messiah", { rj: "book", pages: 300, start_page: 0, status: "finished", finished: d(40), series: "Dune", volume: 2, genre: "Sci-Fi", bm_mood: "dark", bm_impact: 6 });
const sapiens = parseBook("Books/Sapiens.md", "Sapiens", {
  author: "Yuval Noah Harari", pages: 450, start_page: 0, format: "audio", genre: ["History"], ideas: ["Power", "Myth"],
  log: [{ date: d(30), page: 40 }], sessions: [{ date: d(30), fromPage: 0, toPage: 40, pages: 40, hours: 1 }],
}, d(30));
ok(sapiens.state === "reading" && sapiens.rawStatus === "", "status falls back to progress like Reading Journey");
const dropped = parseBook("Books/Old.md", "Old", { rj: "book", status: "dropped", pages: 100, log: [{ date: d(90), page: 10 }] });
ok(dropped.state === "dropped", "'dropped' (abandoned) status recognised");
const books = [dune, messiah, sapiens, dropped];

// ---- velocity & ETA
const v = computeVelocity(books);
ok(Math.round(v.byBook[dune.path].pph) === 50, "Dune speed 250p / 5h = 50 p/h");
ok(Math.round(v.byFormat.audio.pph) === 40, "audio format speed tracked separately (40 p/h)");
const eta = estimateFinish(dune, v)!;
ok(eta.basis === "book" && Math.abs(eta.hours - 6) < 1e-9, "ETA 300 pages left at 50 p/h = 6h");
ok(formatDuration(3.25, { h: "h", m: "m" }) === "3h 15m", "duration format 3h 15m");

// ---- spaced repetition
let s = review(undefined, 2, today);
ok(s.interval === 1 && s.due === addDays(today, 1), "first 'good' → due tomorrow");
s = review(s, 2, today); ok(s.interval === 3, "second 'good' → 3 days");
s = review(s, 3, today); ok(s.interval >= 8 && s.ease > 2.5, "'easy' grows interval & ease → " + s.interval);
s = review(s, 0, today); ok(s.interval === 1 && s.lapses === 1, "'forgot' resets to 1 day");
ok(highlightId("Fear  is the mind-killer.") === highlightId("fear is the mind-killer."), "highlight id is whitespace/case-insensitive");
const hs: Highlight[] = ["a quote one here", "a quote two here", "a quote three here", "a quote four here"].map(t => ({ id: highlightId(t), bookPath: "x", bookName: "X", author: "", text: t, source: "body" }));
const reviews = { [hs[0].id]: { ...review(undefined, 2, today) } };
const due = dueToday(hs, reviews, today, [], 3);
ok(due.length === 3 && !due.includes(hs[0]), "due queue skips future-due items, capped at 3");
ok(dueToday(hs, {}, today, [hs[1].id, hs[2].id], 3).length === 1, "already-reviewed today count against the daily cap");
ok(highlightOfDay(hs, today) === highlightOfDay(hs, today), "highlight of the day is stable for the day");

// ---- series
const [dSeries] = groupSeries(books);
ok(dSeries.total === 6 && dSeries.finished === 1 && dSeries.pct === 17, "series 1/6 finished = 17%");
ok(dSeries.missing.join(",") === "3,4,5,6" && dSeries.next === dune, "missing volumes 3–6, next = Dune (in progress)");

// ---- stalled, goal, mood
const st = stalledBooks(books, today, 14, {});
ok(st.length === 1 && st[0].book === sapiens && st[0].idle === 30, "Sapiens idle 30 days is stalled; dropped book ignored");
ok(stalledBooks(books, today, 14, { [sapiens.path]: addDays(today, 3) }).length === 0, "snooze hides the nudge");
ok(pagesInRange(books, d(29), today) === 300, "pages in last 30 days = 50 + 100 + 150 = 300");
const finishedThisYear = parseBook("Books/Y.md", "Y", { rj: "book", pages: 200, status: "finished", finished: today });
const g = goalPace([...books, finishedThisYear], 24, today)!;
ok(g.finished >= 1 && g.goal === 24 && g.requiredPerDay > 0, "goal pace → required " + g.requiredPerDay + " p/day, now " + g.currentPerDay);
ok(goalPace(books, 0, today) === null, "no goal → no pace");
const ms = moodStats(books);
ok(ms.moods.philosophical === 1 && ms.topImpact[0] === dune && ms.impactByGenre[0].genre === "Sci-Fi", "mood & impact stats");

// ---- concepts (Arabic-safe boundaries)
ok(conceptRegex("العولمة").test("تحدث الكاتب عن العولمة وأثرها") && !conceptRegex("عولمة").test("العولمة"), "Arabic word boundaries work (no partial-word match)");
const note = "---\nideas: [Power]\n---\nThe book is about power and ecology. Already [[Myth]] here.\n```\npower in code\n```\nWe see Power again.";
const sug = suggestLinks(note, collectConcepts([sapiens, dune], []), "Dune");
ok(sug.some(x => x.concept === "Power" && x.match === "power") && !sug.some(x => x.concept === "Myth"), "suggests unlinked concepts, skips existing links");
const linked = applyLinks(note, sug.filter(x => x.concept === "Power"));
ok(linked.includes("[[Power|power]] and ecology") && linked.includes("power in code") && linked.startsWith("---\nideas: [Power]"), "links first prose occurrence only; frontmatter & code untouched");
const graph = conceptGraph(books, collectConcepts(books, []), { [dune.path]: "power", [sapiens.path]: "" }, [{ id: "1", bookPath: dune.path, bookName: "Dune", author: "", text: "Power over spice", source: "body" }]);
ok(graph[0]?.concept === "Power" && graph[0].books.length === 2 && graph[0].quotes.length === 1, "concept graph links Power across Dune & Sapiens with its quote");

// ---- note parsing
const body = "---\nrj: book\n---\n## Notes & Quotes\n- just a note\n\n## Highlights\n- \"Fear is the mind-killer.\"\n> I must not fear.\n> Fear is the little-death.\n\n### Part two\n- Nested highlight under highlights\n## Other\nA line with a gem #quote\n## Flashcards\n- What is the spice?::Melange\nWho rules Arrakis? :: The Atreides\n";
const hl = extractHighlights(body);
ok(hl.includes("Fear is the mind-killer.") && hl.includes("I must not fear. Fear is the little-death.") && hl.includes("Nested highlight under highlights") && hl.includes("A line with a gem") && !hl.includes("just a note"), "highlights: section bullets, joined blockquotes, sub-sections, #quote lines — not notes → " + JSON.stringify(hl));
const fc = extractFlashcards(body);
ok(fc.length === 2 && fc[1].answer === "The Atreides", "flashcards Q::A parsed");
const ins = insertUnderHeading("# T\n\n## Reading Sessions\n- old\n", "## Reading Sessions", "- new");
ok(ins.indexOf("- new") < ins.indexOf("- old"), "session log inserts newest first");
const app = appendToSection("## Flashcards\n- a::b\n\n## Next\n", "## Flashcards", "- c::d");
ok(app.indexOf("- c::d") > app.indexOf("- a::b") && app.indexOf("- c::d") < app.indexOf("## Next"), "flashcard appended inside its section");
ok(appendToSection("x", "## Flashcards", "- q::a").endsWith("## Flashcards\n- q::a\n"), "missing section is created");

console.log(fails ? "\n" + fails + " FAILED" : "\nALL PASSED");
process.exit(fails ? 1 : 0);
