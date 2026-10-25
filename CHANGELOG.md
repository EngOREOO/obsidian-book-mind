# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-10-25

### Added
- Book metadata lookup by title, author or ISBN via OpenLibrary, plus Google Books when you add your own API key. It creates new book notes or fills empty fields in existing ones, and covers can be downloaded into the vault.
- Live reading session timer with pause and resume, quick notes, start and end pages, and a session log written into the book note. The timer survives restarts.
- Reading speed (pages per hour) per book, genre and format, with a realistic time-to-finish estimate.
- Spaced-repetition review of highlights taken from the `quotes` field, `## Highlights` sections and `#quote` lines.
- Series and multi-volume tracker showing completion %, missing volumes and the next book.
- Concept auto-linker and a cross-book concept graph, with Arabic-safe word boundaries.
- Mood and intellectual-impact ratings with statistics.
- Stalled-book nudges (status bar and sidebar) with Continue / Mark as abandoned / Snooze.
- Yearly challenge pacing ("read N more pages a day").
- Quote cards rendered to PNG in five styles, with RTL support.
- Monthly and yearly reading wrap-ups.
- Flashcards (`Question::Answer`) exported for the Spaced Repetition plugin and as an Anki import file.
- `book-mind` code block for embedding.
- English and Arabic interface with instant RTL switching.
- Optional integration with Reading Journey: sessions logged here flow into its hours and history.
