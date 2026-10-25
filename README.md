<div align="center">

# 🧠 Book Mind & Reading Companion for Obsidian

**Read it. Remember it. Connect it.**
A reading companion for Obsidian. It times your sessions, predicts when you'll finish, brings your highlights back
with spaced repetition, links ideas across books, and turns quotes into shareable cards.

[![CI](https://github.com/EngOREOO/obsidian-book-mind/actions/workflows/ci.yml/badge.svg)](https://github.com/EngOREOO/obsidian-book-mind/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/EngOREOO/obsidian-book-mind?sort=semver)](https://github.com/EngOREOO/obsidian-book-mind/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/EngOREOO/obsidian-book-mind/total)](https://github.com/EngOREOO/obsidian-book-mind/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-%E2%89%A51.5.0-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md)
[![Stars](https://img.shields.io/github/stars/EngOREOO/obsidian-book-mind?style=social)](https://github.com/EngOREOO/obsidian-book-mind/stargazers)

[Features](#-features) · [Install](#-installation) · [Quick start](#-quick-start) · [Book note format](#-the-book-note-format) · [Workflow integration](#-integrate-it-with-your-obsidian-workflow) · [Dataview recipes](#-dataview-recipes) · [FAQ](#-faq)

</div>

---

Most book trackers stop at a cover and a page count. **Book Mind** cares about what happens *after* you read:

- You underline a brilliant idea and a month later it's gone. → **Spaced-repetition highlight review**
- Two books say the same thing in different words. → **Concept auto-linker & concept graph**
- You don't know if you'll make it through 600 pages. → **Reading speed & time-to-finish ETA**
- A book has sat on "Reading" for weeks. → **Stalled-book nudges**
- You want to share that line. → **Quote cards (PNG)**, generated right inside Obsidian

Everything is stored in **plain Markdown + YAML** in your vault, so nothing is locked in.

## ✨ Features

| | Feature | What it does |
|---|---|---|
| 🔎 | **Metadata fetcher** | Search by title, author or **ISBN** through [OpenLibrary](https://openlibrary.org) (free, no key). Optionally add a Google Books key as well. Creates a ready-to-use book note, or fills the empty fields of the note you're in, with cover, author, year, pages, publisher and genres. |
| ⏱️ | **Live reading sessions** | A quiet timer with pause/resume and quick notes. It records start and end pages and writes a session log into the book note. The timer survives app restarts and is shown in the status bar. |
| ⚡ | **Speed & ETA** | Pages per hour per book, **per genre** and **per format** (paper / e-book / audio). You get estimates like *"≈ 3h 15m left at your Sci-Fi pace"*. |
| 💡 | **Spaced-repetition highlights** | Each day a few highlights resurface in the sidebar. Grade them *Forgot / Hard / Good / Easy* and an SM-2 scheduler decides when you see them next. |
| 📚 | **Series tracker** | `series` + `volume` turn into a series view with completion %, missing volumes and the next book. |
| 🔗 | **Concept auto-linker** | Finds concepts from your other books (ideas, genres, a concepts folder) in the current note and offers to turn them into `[[wikilinks]]`, so the Graph View connects your books. Works with Arabic text. |
| 🕸️ | **Concept graph** | Shows ideas shared by two or more books, with the quotes that mention them. |
| 🎭 | **Mood & impact** | When you finish a book, tag its mood (inspiring, philosophical, dark…) and its intellectual impact from 1 to 10, and see which kinds of books actually move you. |
| ⏸️ | **Stalled-book nudge** | A book on *Reading* untouched for 14+ days (configurable) triggers a gentle prompt: **Continue**, **Mark as abandoned**, or **Snooze**. |
| 🎯 | **Yearly challenge pacing** | *"Read 15 more pages a day to stay on track."* Also shows whether you're ahead of or behind schedule. |
| 🖼️ | **Quote cards** | Turn any highlight or selection into a 1080×1350 PNG in five styles, with full RTL support for Arabic quotes. |
| 🎁 | **Reading wrap-ups** | Monthly or yearly "Spotify Wrapped for books": pages, hours, books finished, top author, top genre, formats, moods and your 3 strongest highlights. |
| 🃏 | **Flashcards** | `Question::Answer` lines exported as a deck for the [Spaced Repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) plugin, plus a tab-separated file for **Anki**. |
| 🌍 | **English / Arabic** | An instant `EN | عربي` switch with a complete right-to-left layout. |

## 📦 Installation

### Option A: BRAT (recommended until it's in the community store)
1. Install **[Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat)** from *Settings → Community plugins*.
2. Run **BRAT: Add a beta plugin for testing** and paste `https://github.com/EngOREOO/obsidian-book-mind`.
3. Enable **Book Mind & Reading Companion** in *Settings → Community plugins*.

### Option B: Manual
1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/EngOREOO/obsidian-book-mind/releases/latest).
2. Put them in `<your vault>/.obsidian/plugins/book-mind/`.
3. Reload Obsidian and enable the plugin.

## 🚀 Quick start

1. Click the **🧠 brain icon** in the ribbon. The companion opens in the right sidebar.
2. Press **+**, type a title or ISBN (for example `Atomic Habits` or `9780735211292`), and pick a result. A book note is created in your books folder.
3. Press **▶ Start session** on the book. Read. Press **Finish**, enter the page you reached, and you're done.
4. Add highlights to the book (see the format below). Starting tomorrow they come back in **Daily highlights**.

## 📝 The book note format

Book Mind reads ordinary notes in your books folder. A book note is any note whose frontmatter has `rj: book`,
`author` or `pages`:

```yaml
---
rj: book
author: Frank Herbert
pages: 604
start_page: 0
status: reading          # want | reading | paused | finished | dropped (= abandoned)
format: paper            # paper | ebook | audio
genre: [Sci-Fi, Classics]
cover: https://covers.openlibrary.org/b/id/12345-L.jpg
series: Dune             # optional: series tracker
volume: 1
series_total: 6
ideas: [Ecology, Power]  # used by the concept graph & auto-linker
quotes:                  # highlights (also read from the body, see below)
  - Fear is the mind-killer.
bm_mood: philosophical   # set by the Mood & impact dialog
bm_impact: 9
log: []                  # page checkpoints (written by sessions)
sessions: []             # timed sessions (written by sessions)
---
```

Highlights and flashcards can also live in the body:

```markdown
## Highlights
- "I must not fear. Fear is the mind-killer."
> Long passages can be written as blockquotes,
> across several lines.

Any line anywhere tagged with #quote is collected too.

## Flashcards
- What is the spice called?::Melange
- Who rules Arrakis at the start?::House Harkonnen

## Reading Sessions
- 2026-10-25 · p. 120→168 (48 p) · 1h 5m · 44 p/h — Paul meets the Fremen
```

The `## Reading Sessions` list is written by the plugin, newest first.

## 🔗 Integrate it with your Obsidian workflow

### Daily notes & templates
Add a live block to your daily-note template (core Templates or Templater):

````markdown
## 📖 Reading
```book-mind
session reading highlights
```
````

| View | Renders |
|---|---|
| `session` | The running session timer (if any) |
| `reading` | Books in progress with progress bars and ETA |
| `highlights` | Today's spaced-repetition highlights |
| `goal` | Yearly challenge pacing |
| `series` | All series with completion |
| `concepts` | Ideas shared across books |

### A reading "home" / MOC

````markdown
# 📚 Library
```book-mind
goal reading series concepts
```
````

### Graph View that actually connects books
Run **Suggest concept links in the current note** while you write a book summary. Ideas you've tracked in other books become
`[[wikilinks]]`, and Graph View starts showing how your books relate. Put permanent concept notes in a folder
(for example `Concepts/`) and set it in settings, so those notes become link targets too.

### Spaced repetition beyond the sidebar
Run **Export flashcards** to write `Flashcards/Book Mind Deck.md` (tagged `#flashcards/<book>` for the Spaced Repetition plugin)
and `Flashcards/Book Mind Anki.txt` (import into Anki as tab-separated: *Front*, *Back*, *Tags*).

### Monthly & yearly reviews
Run **Generate monthly reading wrap-up** (or yearly). It writes `Reports/Reading Wrap-up YYYY-MM.md`, which you can embed in your
periodic review with `![[Reading Wrap-up 2026-10]]`.

### Hotkeys

| Command | Suggested hotkey |
|---|---|
| Start / finish a reading session | `Ctrl/Cmd + Shift + R` |
| Add a book (search OpenLibrary) | `Ctrl/Cmd + Shift + B` |
| Create a quote card from the selection | |
| Suggest concept links in the current note | |
| Review today's highlights | |
| Fetch metadata for the current book note | |
| Add a flashcard to a book · Export flashcards | |
| Generate monthly / yearly reading wrap-up | |
| Rate mood & impact of the current book · Mark the current book as abandoned | |
| Toggle language (EN / عربي) | |

Right-click any selected text for **Add selection to book highlights** and **Quote card**.

### Companion plugins (optional)
- **Reading Journey:** if it is installed, Book Mind uses its books folder and yearly goal, and logs sessions **through it**, so its hours, streaks and calendar update too. Both plugins share the same note format.
- **[Habit Streak & Identity Tracker](https://github.com/EngOREOO/obsidian-identity-habit-tracker):** a session logged in Book Mind reaches Reading Journey's hours, which complete a reading habit and give XP to your "Reader" identity, with no extra setup.

Without them, Book Mind runs standalone with the same note format.

## 📈 Dataview recipes

Replace `"Books"` with your books folder.

**Currently reading, with progress**
````markdown
```dataview
TABLE WITHOUT ID file.link AS Book, author AS Author, round(max(log.page) / pages * 100) + "%" AS Progress
FROM "Books"
WHERE status = "reading"
```
````

**Most impactful books**
````markdown
```dataview
TABLE WITHOUT ID file.link AS Book, bm_impact AS Impact, bm_mood AS Mood
FROM "Books"
WHERE bm_impact
SORT bm_impact DESC
LIMIT 10
```
````

**Books per series**
````markdown
```dataview
TABLE WITHOUT ID series AS Series, length(rows) AS Volumes, length(filter(rows.status, (s) => s = "finished")) AS Finished
FROM "Books"
WHERE series
GROUP BY series
```
````

## ⚙️ Settings

| Setting | Default |
|---|---|
| Language | English |
| Reading Journey integration | On (only active when installed) |
| Books folder / yearly goal | `Books` / 24 (used standalone) |
| Highlights per day | 3 |
| Stalled-book reminder after | 14 days |
| Google Books API key | empty (OpenLibrary only) |
| Download covers into the vault | Off |
| Reports / Quote cards / Flashcards folders | `Reports` / `Quote Cards` / `Flashcards` |
| Concepts folder | empty |
| Status bar item | On |

## 🔒 Privacy

The **only** network requests are book lookups, and they only run when you press *Search* (and cover downloads, if you enable them).
There is no telemetry and no background sync. Review state lives in `.obsidian/plugins/book-mind/data.json`. Everything else is in your notes.

## ❓ FAQ

<details>
<summary><b>Why OpenLibrary and not Google Books?</b></summary>
Google Books has no anonymous quota, so requests without a key are refused. OpenLibrary is free and keyless, and it finds Arabic titles too. If you want Google results as well, add your own API key in settings.
</details>

<details>
<summary><b>Does it work on mobile?</b></summary>
Yes. Lookups use Obsidian's own network API, so there are no CORS issues. The timer is timestamp-based, so it stays correct even if the app sleeps.
</details>

<details>
<summary><b>Will editing a book in Reading Journey wipe my review progress?</b></summary>
No. Review state is stored in Book Mind's own data, keyed by the quote text, never inside the note.
</details>

<details>
<summary><b>How is "time left" calculated?</b></summary>
From timed sessions only. It uses the most specific reliable rate: this book → its genre → its format → your overall average.
</details>

## 🛠️ Build from source

```bash
git clone https://github.com/EngOREOO/obsidian-book-mind.git
cd obsidian-book-mind
npm install
npm run build   # strict TypeScript + esbuild → main.js
npm test        # pure-core smoke test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout.

## 🗺️ Roadmap

- [ ] Historical timeline: link events and people in a book to a timeline view
- [ ] Kindle / Readwise highlight import
- [ ] Reading heatmap in the sidebar
- [ ] Submission to the Obsidian community plugin store

## 🤝 Contributing & support

Issues, ideas and pull requests are welcome. Please open an [issue](https://github.com/EngOREOO/obsidian-book-mind/issues).
If Book Mind helps you remember what you read, **please ⭐ star the repo**. It helps other readers find it.

## 📄 License

[MIT](LICENSE) © 2026 Ahmed Hany

---

<sub>Keywords: Obsidian book tracker · reading tracker · reading log · spaced repetition highlights · Kindle highlights · book notes · OpenLibrary ISBN lookup · reading speed · reading goal · quote cards · Anki flashcards · Zettelkasten · PKM · second brain · Arabic RTL plugin</sub>
