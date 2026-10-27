# Phase 5 — Trust Implementation Plan

> Executed inline (superpowers:executing-plans), TDD for every pure module, one fresh whole-branch review at the end.

**Goal:** Ali can check any account against reality in one sheet (the app fixes the balance with an adjustment and keeps a drift history), and his rent, bills and subscriptions show up on Home on their day, posted with one tap.

**Architecture:** Two pure modules carry the logic: `money.ts` gains `drift`, `driftTrend` and `parseAdjustAmount`; a new `recurring.ts` works out each item's period, date and state (due / posted / upcoming / none). The store writes a check and its adjustment in one transaction (one Undo), and posts a recurring item as an ordinary entry with `recurring_id`. UI: `ReconcileSheet` (from a Home balance card or More), `RecurringSheet` (add/edit/delete), a Due card on Home, and Recurring and Reconcile sections on More. No migration: the `recurring` and `reconciliations` tables, RLS, indexes and push order (recurring before entries) have existed since phase 0. No Dexie version bump.

**Spec:** `SPEC.md` §6 Home + More, §7 Reconcile + Recurring (Phase 5 rulings), §10 phase 5. `CLAUDE.md`.

## Ruling (asked 2026-10-27)
- **Recurring due:** from the item's day inside the plan (short months use their last day), until posted or the plan ends. The spec's literal "day_of_month ≤ today" breaks across the month boundary. Refined while writing tests: a plan longer than a month (early or late salary) can hold the day twice, so the item is due while posted entries in the period < dates already reached. "Once per plan" would silently skip the second bill.

## Rulings taken up front (no question needed)
- Period: the open plan from its start to its payday, or to today while the salary is late; with no plan, the calendar month. Posted = a live entry with the item's `recurring_id` dated inside the period.
- Post: one tap, dated today, the item's type/amount/account/category, note = item name, rate = effective rate now. No Skip button. Only items whose account and category still exist can show as due.
- Reconcile: dated today; the actual balance must be typed and may be negative. Drift 0 → green, else orange plus the adjustment Save will make. Adjust entry: category Other (else the first live non-income category), note "Reconcile" in the UI language, rate frozen now. One transaction, one Undo for both rows.
- Adjustments never touch envelopes or the weekly limit (§5 counts `out` only).
- Editing an adjustment in History keeps its sign (`parseAdjustAmount`: signed, non-zero).
- Drift trend: per account with ≥ 2 checks, latest |drift| vs previous |drift|, summed in GHS (USD at today's rate): steady / shrinking / growing, mostly (account with the largest latest drift); all latest 0 → "last checks matched"; otherwise no line.
- More order: Recurring, Reconcile, Accounts, Preferences, Account. Drift history: latest 10, "Show all".
- Home: balance cards become buttons that open Reconcile; the Due card sits between envelopes and today's entries (§6 order).
- New recurring items default to Out, the last-used out account, the first fixed category, and today's day of the month.

## Tasks
1. **Spec:** SPEC §6 More note, §7 Phase 5 rulings.
2. **Pure core (TDD):** `money.ts` `drift`, `driftTrend`, `parseAdjustAmount`; `recurring.ts` `recurringPeriod`, `occurrence`, `recurringState`, `dueItems`.
3. **Store (TDD):** `reconcile` + `undoReconcile`; `saveRecurring`, `deleteRecurring`, `restoreRecurring`; `postRecurring` (entry with `recurring_id`).
4. **UI:** data hooks (`useRecurring`, `useReconciliations`, `useRecurringPeriod`); `ReconcileSheet`; `RecurringSheet`; Home balance cards → Reconcile, Due card; More Recurring + Reconcile sections with trend and drift history; EntrySheet signed amount for adjustments; icons; EN + AR strings.
5. **Verify + ship:** typecheck, tests, build, Playwright 390 + 1280 in EN and AR, fresh reviewer, deploy, PROGRESS.

## Review Focus
1. Due logic: month boundary, 29–31 in short months, a late salary, no plan. Post hides the item; Undo brings it back.
2. After Reconcile the account balance equals the typed actual to the cent; Undo leaves no trace (no check, no adjustment).
3. A negative adjustment edits and saves (server check: adjust ≠ 0); in/out entries still reject negatives.
4. Push order: a recurring item created offline reaches the server before the entry that points at it.
5. RTL: new rows, signed amounts and the trend line in Arabic.
