# Contributing

Thanks for helping improve Book Mind & Reading Companion!

## Development setup

```bash
git clone https://github.com/EngOREOO/obsidian-book-mind.git
cd obsidian-book-mind
npm install
npm run dev     # watch mode, rebuilds main.js on save
```

Copy or symlink the repo into `<vault>/.obsidian/plugins/book-mind/` and reload Obsidian. The
[Hot-Reload](https://github.com/pjeby/hot-reload) plugin makes this instant.

## Before opening a pull request

```bash
npm run build   # strict TypeScript check + production bundle
npm test        # pure-core smoke test (no Obsidian needed)
```

- Keep CSS selectors namespaced with `bm-`.
- Every user-facing string goes through `src/i18n.ts`. Add both English and Arabic, or leave the Arabic as English and mention it in the PR.
- Logic that can be pure belongs in `src/core/` and should be covered by `tests/core.smoke.ts`.
- Network access is only allowed in `src/services/metadata.ts`, and only on explicit user action.

## Project layout

| Path | What lives there |
|---|---|
| `src/main.ts` | Plugin entry: commands, sessions, writes |
| `src/core/` | Pure logic: book model, velocity, SRS, series, goals, concepts, note parsing |
| `src/services/` | Vault index, metadata lookup, quote-card rendering |
| `src/integrations/readingJourney.ts` | Optional Reading Journey bridge |
| `src/ui/` | Sidebar view, modals, settings |
| `src/reports/wrapUp.ts` | Monthly and yearly wrap-ups |
