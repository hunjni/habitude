# Stress tests

Two layers:

## 1. Unit stress (`npm run test:stress`)

`stress-run.ts` bundles the real `src/store.ts`, `src/stats.ts` and
`src/utils/dates.ts` with esbuild, aliasing `obsidian` to
`mock-obsidian.ts` (a filesystem-backed Vault mock with `stat.mtime`
semantics). Scenarios:

- **S1** — 200 habits + 730 daily logs: load/stats/toggle timings
- **S2a** — 50 rapid sequential toggles: latency + final-state integrity
- **S2b** — 50 concurrent toggles on one file: lost-write race check
- **S3** — malformed `Habits.md` / log files: parsers must never throw
- **S4** — external (hand) edits: freshness
- **S5** — empty vault: first-run
- **S6** — day-check mtime cache: 0 reads on re-render, invalidation on hand edit

Found and fixed by this suite:

1. **Lost updates on concurrent toggles** — `setCheck` was read-modify-write
   with no serialization; 50 concurrent toggles on one day file kept only
   2 of 50 writes. Fixed with a per-file promise-queue write lock in
   `HabitStore` (also applied to `Habits.md` writes).
2. **Slow re-renders** — every toggle re-read ~67 log files. Fixed with an
   mtime-keyed day cache (explicitly invalidated after our own writes;
   hand edits invalidate via OS mtime).
3. **Slow cold render** — the view waited for 60 days of history before
   painting. Now paints after the visible week loads and fills streaks in
   asynchronously (guarded by a render sequence).

## 2. Real Obsidian probe (manual)

Headless Obsidian 1.9.12 under Xvfb with `--remote-debugging-port=9222`,
driven over CDP (see `/tmp/cdp-stress.mjs` — ephemeral):

1. Seed a vault with 200 habits + 60 days of logs.
2. Install the built plugin, trust the vault via CDP when prompted.
3. Click the ribbon icon → measure time to 200 rendered rows.
4. Click a toggle → measure time to `✓`.
5. Click 10 toggles rapidly → verify all land.

Results (2026-09-15): plugin load ~ms, 200-habit grid **48ms** warm
(first row 14ms), single toggle **20–150ms**, 10 rapid toggles all land.
Cold-start runs right after an Obsidian reload measure higher (up to ~1s)
due to Electron/vault warm-up, not plugin code — the plugin-side path is
week-load (7 files) + DOM build.
