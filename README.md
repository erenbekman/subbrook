# Subbrook

Every subscription, in one calm stream. A free, local-first subscription tracker for macOS, Windows and Linux.

- **Stack:** Tauri 2 · Vue 3 · TypeScript · SQLite (raw SQL through `tauri-plugin-sql`)
- **No account, no server.** Everything lives in one SQLite file in the app-data folder
  (macOS: `~/Library/Application Support/app.subbrook.desktop/subbrook.db`).
- **Design:** "Paper & Ink" design system — tokens in `src/styles/tokens.css`.

## Run

Requirements: Node 20+, Rust (stable) and the Tauri prerequisites for your OS
(macOS: Xcode Command Line Tools).

```bash
npm install
npm run tauri dev      # desktop app with hot reload
npm run tauri build    # signed bundle later; unsigned .app/.dmg for now
```

`npm run build` alone type-checks and builds the frontend.

## Layout

```
src/
  App.vue                 dock + view switch + keyboard shortcuts (⌘1–4, ⌘N)
  components/             Dock, ServiceTile, SubscriptionSheet (add/edit)
  views/                  Overview, CalendarView, Subscriptions, Categories
  lib/
    db.ts                 all SQL lives here
    store.ts              one reactive store, no Pinia
    dates.ts              recurrence math (local calendar days, DST-safe)
    money.ts              minor units, per-month normalization, formatting
    month.ts              derived month data for Overview and Calendar
  styles/                 tokens.css (light + dark), base.css
src-tauri/
  migrations/0001_init.sql   schema; add 0002_*.sql and register it in lib.rs
  src/lib.rs                 plugins + migrations
```

## Conventions

- Money is stored as integer minor units (`amount_minor`), never floats.
- Dates are `YYYY-MM-DD` strings; SQLite compares them correctly.
- Every price change writes a `price_changes` row, so history is free.
- New dependencies need a reason. Prefer a small function over a package.
