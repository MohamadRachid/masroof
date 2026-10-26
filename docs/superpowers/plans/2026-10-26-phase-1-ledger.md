# Phase 1 — Ledger Implementation Plan

> Executed inline (superpowers:executing-plans), TDD for every pure module, one fresh whole-branch review at the end.

**Goal:** Ali can set opening balances once, add an expense in one tap after typing the amount, see live balances, browse/search/edit/delete history, and undo any save/delete for 5 s — on the phone, offline-tolerant.

**Architecture:** Local-first. Dexie (IndexedDB, one DB per user id) mirrors the Supabase tables; the UI reads only via `useLiveQuery`. Every write goes Dexie → `outbox` → Supabase (`upsert` full rows, last-write-wins). Sync pushes after writes and pulls rows with `updated_at > cursor` on start, focus, `online` and every 60 s while visible. Pure money math lives in `src/lib/money.ts` (integer cents internally).

**Spec:** `SPEC.md` §3, §4, §5 (Balance), §6 (First run, Home, Add, History), §7 (Undo), §10 phase 1. `CLAUDE.md`.

## Rulings taken up front
- Dexie + outbox + basic sync land in Phase 1 (not 6): CLAUDE.md mandates "UI reads from Dexie only; writes go Dexie → outbox → Supabase". Phase 6 keeps offline hardening + two-device verification. Recorded in SPEC §10.
- Entries need `rate_usd_ghs` now; FX arrives in Phase 2, so the stored rate is `effectiveRate()` per §5 (manual → latest `rates` row → 1). Equivalents are not shown until Phase 2.
- New migration: `set_updated_at` fires on insert too, so the pull cursor uses server time.
- Unsynced count chip in the header (§8) comes now, because the outbox exists now.
- Accounts: fixed Bank/Cash/USD created by First run; name + opening balance editable in More (§3).

## Tasks
1. **DB + session:** migration (updated_at on insert), `src/lib/db.ts` (Dexie schema for all §4 tables + `outbox` + `meta`), `userId` in `SessionState`. Tests: sessionState.
2. **Pure core (TDD):** `money.ts` (`toCents`, `round2`, `parseAmount` incl. Arabic digits and comma, `balance`, `formatMoney`), `entries.ts` helpers (`quickTiles`, `lastUsed`, `groupByDay`, `matchesSearch`), `fx.ts` (`effectiveRate`), `dates.ts` (`localDateISO`, day labels).
3. **Sync (TDD with fake-indexeddb + fake remote):** `sync.ts` — `push`, `pull`, pending rows never overwritten by pull, cursor = max server `updated_at`, initial-pull flag.
4. **Data hooks + writes:** `store.ts` (`useAccounts`, `useCategories`, `useEntries`, `useSettings`, `useOutboxCount`, `saveEntry`, `deleteEntry`, `restoreEntry`, `createAccounts`, `updateAccount`, `updateSettings`), toast store + `Toaster`. Tests: writes land in Dexie + outbox; undo.
5. **Gate + First run:** initial pull gate (loading / offline-first-time / ready), First run (language → opening balances → payday).
6. **Home + Add/Edit sheet:** balance cards, "Set up your first salary plan" card, today's entries, Add sheet (quick tiles, amount autofocus, Out/In, account + category chips with last-used defaults, note, date, sticky Save), Undo toasts, `#/add` shortcut.
7. **History:** search, account filter, day groups with daily out totals per currency, tap → edit sheet with Delete.
8. **More + header:** Accounts editor, unsynced chip.
9. **Verify + ship:** typecheck, tests, build, Playwright at 360/390/1280 EN+AR (fake local session, offline), RLS upsert check in SQL, fresh reviewer, deploy, docs.

## Review Focus
1. Two devices editing → last write wins, no duplicate rows (client UUIDs), deletes propagate.
2. Amount input: "12,5", "١٢٫٥", "0", "", "1.005", huge numbers → parsed or rejected sensibly, never NaN stored.
3. Undo after the sheet closed / after navigating / twice in a row.
4. First run must never appear for a user whose accounts exist on the server but haven't been pulled yet.
5. Offline: add works, chip shows pending count, everything pushes on reconnect.
