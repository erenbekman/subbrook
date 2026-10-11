# Subbrook — project brief for Claude Code

Free, open-source (MIT), local-first subscription tracker. Desktop first (macOS, Windows, Linux), iOS later.
Positioning: the paywall-free alternative to SubList (which caps the free tier at 3 subscriptions).
Domains: subbrook.com (primary), subrook.com (301 → subbrook.com).

## Decisions already made — don't reopen without asking
- **Stack:** Tauri 2 + Vue 3 (`<script setup>`, TS) + SQLite via `tauri-plugin-sql`.
- **Minimal dependencies.** No router, no Pinia, no Tailwind, no ORM, no UI kit. A new package needs a one-line reason in the PR.
- **Raw SQL** lives only in `src/lib/db.ts`. Schema changes = new file `src-tauri/migrations/000N_*.sql` + register it in `src-tauri/src/lib.rs`. Never edit an applied migration.
- **No account, no server, no telemetry.** Data = one SQLite file in the OS app-data dir.
- **Distribution:** GitHub Releases (notarized DMG / MSI / AppImage + auto-update) first, Mac App Store later.
- **AI screenshot import:** not in v1. Bank-statement import is heuristic (no AI cost).
- **Runs in the menu bar.** Closing the window hides it; quit via tray menu or ⌘Q. "Open at login" (autostart) starts hidden. Needed because desktop notifications only fire while the app runs.
- **Network:** only for FX rates (TCMB for TRY pairs, ECB fallback/cross), only when more than one currency is tracked; URLs allow-listed in `capabilities/default.json`.
- **Statement import:** generic column mapper (CSV / XLSX via `calamine` / text PDF via pdf.js legacy build); bank-specific presets only from real (anonymized) sample files. Files are parsed in memory, never stored.
- **Calendar:** one-time `.ics` export (RRULE), not a feed — a feed would need a server.

## Conventions
- Money: integer minor units (`amount_minor`). Dates: `YYYY-MM-DD` strings, local calendar days (see `src/lib/dates.ts`, DST-safe noon construction).
- Totals use the user's share (`amount / share_count`) and normalize cycles with `monthlyMinor()`.
- Every price change inserts a `price_changes` row (done in `saveSubscription`).
- Webview has no native `confirm()`; use two-step inline confirmation. External links go through `@tauri-apps/plugin-opener`.
- Keyboard: ⌘1–4 switch views, ⌘N new subscription, ⌘K command palette, ⌘, settings.
- Saving files: `save_file` / `save_binary` Rust commands open the save dialog; the webview never picks a path.
- Before a major feature: write a short pre-mortem (what would make this fail?) in the PR description.

## Design — "Paper & Ink"
- Tokens: `src/styles/tokens.css` (light default + `[data-theme=dark]`). Use variables only; no hex in components.
- Design system (tokens, rules, components): https://claude.ai/artifact/SPiSup9tSotbNxjBjvFTJq
- Screen designs (canvas): https://claude.ai/artifact/VVtFqhHD6dz5US5RAYUZBV — Overview, Calendar, Subscriptions (+ detail tabs), Categories, Statement import, Menu-bar popover, Logo, Share poster, Share receipt.
- Rules: content on paper with hairlines, cards only for floating things; one hero figure per screen (Manrope 300, decimals in `--ink-3`); one filled primary button per screen; mint = paid, lilac = trial, clay = price rise; service tiles = letter on `--cat-N-soft`.
- Wordmark: "subbrook", two-tone — **sub** in leaf/mint, **brook** in ink. Icon source: `app-icon.svg` (`npx tauri icon app-icon.svg` regenerates icons).

## Status
**M1–M3 implemented** (migrations 0001–0004). `npm run build` and `cargo build` clean; runs with `npm run tauri dev` on macOS.

Open items:
- Bank presets (Garanti BBVA, İş, Akbank, Yapı Kredi) — waiting for anonymized sample exports.
- Cancelled subscriptions can't be listed or reactivated yet.
- Deferred: tray "Quick add" (free-text parser), "Category ▾" filter in Subscriptions.
- Known limit: a stored `next_due` clamped to a short month (31 → 28 Feb) keeps the shorter day; fixing it needs a billing-day column.
- Notifications need a bundled `.app` to show reliably (`npm run tauri build -- --debug --bundles app`).

## Roadmap
- **M2 (done):** FX conversion, native notifications, menu-bar tray popover, ⌘K command palette.
- **M3 (done, presets pending):** statement import with recurring-charge detection, CSV export, `.ics` export, share-as-image (poster/receipt).
- **M4:** Signing + notarization, auto-updater, landing page on subbrook.com, launch (Product Hunt, r/macapps, r/selfhosted).
- **Later:** iOS via Tauri mobile, optional sync by placing the DB in iCloud Drive/Dropbox, BYO-key screenshot import.

## Commands
```bash
npm install
npm run tauri dev     # app with hot reload
npm run build         # vue-tsc + vite
npm run tauri build   # bundles
```
