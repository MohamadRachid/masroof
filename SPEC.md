# Personal Expense Tracker — Spec v1

Owner: Ali. Single user, personal, never launched. Phone (Android) + laptop, same data.
Purpose: register every cedi in/out in seconds, always know the real balance, and keep spending inside a monthly salary plan with weekly limits.

This file is the contract. Claude Code builds from it, in the order in §10. Anything not in here is out of scope until the spec changes.

---

## 1. Non-negotiable rules

1. **Entry in under 10 seconds.** Any feature that slows down adding an expense is rejected.
2. **Amounts are stored in their own currency, forever.** The FX rate is for display only. No stored amount is ever converted.
3. **Nothing posts money on its own.** Salary, recurring bills, adjustments: the user taps. The app may nudge, never act.
4. **Warn before, not after.** Limit warnings appear while typing the amount, not in a report later.
5. **Undo, not confirm.** Every save shows a 5-second Undo toast. No confirmation dialogs except "delete all data".

---

## 2. Stack

- **Frontend:** React 18 + Vite + TypeScript, PWA (`vite-plugin-pwa`), mobile-first, dark theme default, installable on Android Chrome and desktop Chrome.
- **Backend:** Supabase (Postgres, Auth, Edge Functions, cron). One project, one user.
- **Auth:** email + password, typed once per device (changed 2026-10-26 from email OTP: one user, no emails needed). Supabase "Confirm email" is off; after the owner creates the account, sign-ups are disabled (Supabase dashboard → Auth → disable new users). RLS on every table: `user_id = auth.uid()`.
- **Local cache / offline:** Dexie (IndexedDB) mirror of all tables + outbox queue. See §8.
- **i18n:** EN + AR, switchable, RTL for AR. Latin digits in both.
- **Hosting:** GitHub repo, deployed to Vercel or Netlify (free, HTTPS, auto-deploy from `main`). GitHub Pages also fine.
- **No UI framework.** Plain CSS modules or Tailwind — pick one, stay with it. No component library.

---

## 3. Currencies and accounts

- Local currency: **GHS** (Ghana cedi). Second currency: **USD**.
- Accounts (fixed for v1, editable name/opening balance in Settings):

| id   | name     | currency | kind |
|------|----------|----------|------|
| bank | Bank     | GHS      | bank |
| cash | Cash     | GHS      | cash |
| usd  | USD      | USD      | cash |

- Each account has an `opening_balance` set at first run (the real balance that day).
- Adding accounts later must be possible without a migration (accounts are rows, not code).

---

## 4. Data model (Postgres)

All tables: `id uuid pk default gen_random_uuid()`, `user_id uuid not null default auth.uid()`, `created_at timestamptz default now()`, `updated_at timestamptz default now()` (trigger), `deleted_at timestamptz null` (soft delete). Client generates `id` so offline inserts are idempotent.

```sql
accounts(name text, currency text check (currency in ('GHS','USD')), kind text, opening_balance numeric(14,2), sort int)

categories(name_en text, name_ar text, kind text check (kind in ('fixed','variable','income','savings')), icon text, sort int, archived bool default false)

entries(
  date date not null,
  type text check (type in ('in','out','adjust')),
  account_id uuid references accounts,
  amount numeric(14,2) check (amount > 0),   -- adjust may be negative
  category_id uuid references categories,
  note text,
  rate_usd_ghs numeric(10,4) not null,       -- effective rate at creation, frozen
  recurring_id uuid null references recurring,
  client_id text                              -- for undo/outbox dedupe
)

plans(
  start_date date not null,                   -- day salary was tapped
  expected_end date not null,                 -- usual next payday
  salary numeric(14,2),
  closed_at timestamptz null
)

plan_envelopes(plan_id uuid references plans, category_id uuid references categories, amount numeric(14,2))

recurring(name text, type text, account_id uuid, amount numeric(14,2), category_id uuid, day_of_month int check (day_of_month between 1 and 31))

reconciliations(date date, account_id uuid, actual numeric(14,2), computed numeric(14,2), diff numeric(14,2))

rates(date date unique, usd_ghs numeric(10,4), source text)   -- one row per day, written by cron

settings(user_id pk, lang text default 'en', rate_mode text check (rate_mode in ('auto','manual')) default 'auto',
         manual_rate numeric(10,4), usual_payday int default 25, warn_pct int default 80, week_start int default 1)
```

Default categories (seeded on first run):

| name_en   | kind     |
|-----------|----------|
| Rent      | fixed    |
| Bills     | fixed    |
| Data/Phone| fixed    |
| Food      | variable |
| Groceries | variable |
| Transport | variable |
| Fun       | variable |
| Health    | variable |
| Family    | variable |
| Buffer    | variable |
| Savings   | savings  |
| Salary    | income   |
| Other     | variable |

Implementation notes (phase 0, migration `20261026105040_init`):
- `rates` is global reference data (one row per day, written by the cron with the service role), so it has no `user_id`. Signed-in users can only read it.
- RLS allows select / insert / update on own rows only. There is no delete policy, so the database enforces soft delete.
- Default categories (with Arabic names and icon keys) and the `settings` row are seeded by a trigger on `auth.users` at signup, not by the client. Two devices can never double-seed.
- Stricter than the sketch above: `entries.date/type/account_id/category_id/amount/rate_usd_ghs` are NOT NULL, `plans.salary` is NOT NULL (≥ 0), `expected_end ≥ start_date`, and there is one live envelope per (plan, category). `accounts.kind` stays unconstrained so new kinds (e.g. MoMo) need no migration.

Phase 4 (2026-10-27, migration `plans_leftover`): `plans` gains `leftover numeric(14,2)` and `leftover_action text check in ('savings','buffer','ignore')` (set together, on the plan being closed, only when leftover > 0), and `carry_in numeric(14,2) not null default 0` (≥ 0, on the new plan when the leftover went to its Buffer).

---

## 5. Core math (single source of truth, pure functions in `src/lib/money.ts`, unit-tested)

**Balance(account)** = opening_balance + Σ in − Σ out + Σ adjust (entries not soft-deleted).

**Effective rate now** = `settings.manual_rate` if `rate_mode = 'manual'`, else latest row in `rates`. If neither exists, 1 and the UI shows "no rate".

**Equivalent display:** every amount shows its other-currency value underneath, small and muted.
- Entries use the entry's frozen `rate_usd_ghs`.
- Balances, envelopes, totals use the effective rate now.

**Envelope spent (category, plan)** = Σ `out` entries with that category and `date` in `[plan.start_date, next plan start or today]`. USD entries count at their frozen rate.

**Envelope left** = envelope amount − envelope spent.

**Variable left** = Σ envelope left over categories with kind = `variable`.

**Days remaining** = days from today to `plan.expected_end`, inclusive, minimum 1.

**Safe to spend today** = variable left ÷ days remaining. This is the headline number on Home.

**Weekly limit** (weeks run Mon–Sun, `settings.week_start`):
- `variable_left_at_week_start` = Σ variable envelopes − Σ variable out before this week's start.
- `weeks_remaining` = weeks from this week to `expected_end`, inclusive, minimum 1.
- `weekly_limit` = variable_left_at_week_start ÷ weeks_remaining.
- `spent_this_week` = Σ variable out with date in this week.
- Status: green < `warn_pct`%, orange ≥ `warn_pct`%, red ≥ 100%.

Fixed envelopes (rent, bills) never count toward the weekly limit.

Implementation notes (phase 3, 2026-10-26):
- If day-to-day money was already overspent before this week started, the weekly limit shows 0 and the week is red (never a negative limit). With no day-to-day envelopes there is no weekly budget at all.
- Thresholds are compared in cents, so 80 % is exactly 80 %.
- Envelope colours: red only when spending goes past the planned amount. Day-to-day envelopes turn orange from warn %. Fixed bills and savings are meant to be used up, so they never turn orange.
- "Spent this week" counts entries inside the current plan, up to today. A past plan's period ends the day before the next plan starts, so a day is never counted twice.

---

## 6. Screens

### Login
Email + password (with show/hide). "Create account" is used once, the first time. Once logged in, session persists; never asks again unless signed out. Offline with a stored session, the app opens straight away.

### First run (once)
Language → opening balance for bank, cash, usd → usual payday → done. No plan yet; Home shows balances and a "Set up your first salary plan" card.

### Home
Top: **Safe to spend today** (big, GHS, with USD equivalent small). Colour follows weekly status.
Then: weekly bar — spent / limit, with status colour.
Then: three balance cards (bank, cash, usd), each with the other-currency equivalent. Tap a card → Reconcile sheet.
Then: envelopes list for the current plan, each with a thin progress bar and "left".
Then: "Due" banner if recurring items are due and not posted (one tap Post per item).
Then: today's entries.
Floating **+** button → Add.
Rate line in the footer: `1 USD = 15.42 GHS · auto · today` (or `manual`).

### Add (bottom sheet, opens from + or from the Android home-screen shortcut)
Order top→bottom:
1. **Quick tiles**: top 6 (category, amount, account) combinations from the last 30 days, one tap = saved. Hidden if fewer than 3 entries exist.
2. Amount — big numeric field, autofocus, numeric keyboard.
3. Out / In toggle (default Out).
4. Account chips (default: last used).
5. Category chips (default: last used; income categories only shown when In).
6. **Live impact line** while typing: "Week: 320 / 400 GHS" turning orange/red; if over: "+35 GHS over this week". Also "Envelope Food: 60 GHS left".
7. Note (optional), date (default today).
8. Save → closes sheet, Undo toast 5s.

Saving must work with 1 tap after typing the amount when defaults are right.

### History
Reverse-chronological, grouped by day with a daily "out" total. Search box (note, category, amount). Account filter chips. Tap entry → edit sheet (same form) with Delete.

### Plan
Current plan: salary, envelopes (editable amounts), total allocated vs. salary (must not exceed salary; unallocated shows as a warning). Planned vs. actual per envelope.
Button: **Salary received** → see §7.
Past plans: list; tap → read-only planned vs. actual.
Phase 3 notes (2026-10-26): until Salary received exists (phase 4), a plan is started from the Plan screen (start = today, end = next payday, editable) without creating a salary entry. Every non-income category gets an envelope (it may be 0). For the first plan, "Suggest amounts" splits the salary by default shares (Rent 30 %, Bills 8, Data/Phone 3, Food 15, Groceries 10, Transport 8, Fun 5, Health 3, Family 5, Buffer 5, Savings 8), rounded to tens, with the remainder in Buffer. The live impact line in Add shows for new Out entries only.
Phase 4 notes (2026-10-27): **Salary received** is the Plan screen's main button. The empty Plan screen keeps "start a plan without recording a salary" as a quiet second button, because on first run the salary may already be in the opening balance. A plan with carry-over shows "Carried over" under the salary; "Assigned" may reach salary + carried over, never more. A past plan shows what happened to its leftover.

### More
- Recurring: list + add/edit (name, in/out, amount, account, category, day of month). Due items also surface on Home.
- Reconcile: per account, last reconcile date + drift; tap → sheet. Drift history list (date, diff) with a one-line trend: "drift shrinking" / "drift growing, mostly Cash".
- Settings: language, rate mode + manual rate, usual payday, warn %, week start, accounts (name/opening), categories (add/rename/archive, set kind), export JSON, delete all data (typed confirmation).
Phase 5 notes (2026-10-27): More runs Recurring, Reconcile, then the settings groups. Each recurring row shows its day, account and state in this plan (due now / posted on a date / next on a date). Each Reconcile row shows the account's last check and its drift. The drift history shows the latest 10 checks, with a "Show all" button. The trend line (§7) sits above the history.

---

## 7. Flows

**Salary received** (Plan screen, or Home nudge when `usual_payday` has passed and no plan started this month):
1. Enter salary amount and account (default bank). Creates an `in` entry, category Salary.
2. If a plan is open: show close summary — planned vs. actual per envelope, total over/under. Ask what to do with leftover variable money: *Move to Savings* (creates an envelope note, not a money move), *Add to next Buffer*, *Ignore*. Mark plan `closed_at`.
3. Create the new plan: `start_date` = today, `expected_end` = next `usual_payday` (if this month's payday is 10 days away or less, the salary counts as early and the plan runs to the following month's payday), envelopes prefilled from the previous plan (or defaults on first run). User edits, saves.

Phase 4 rulings (2026-10-27):
- Leftover = the closing plan's variable left (§5) for its period, which ends the day before the new plan starts. At 0 or below there is nothing to decide. A plan that started today has an empty period, so it has no leftover.
- *Move to Savings* is a note on the closed plan (`leftover`, `leftover_action = 'savings'`); balances and the new plan don't change. *Ignore* is recorded the same way.
- *Add to next Buffer*: the new plan's Buffer envelope starts higher by the leftover, and its budget becomes salary + leftover (`carry_in`). Offered only while a live Buffer category exists. The carry is a one-off: the plan after it prefills Buffer without it.
- One sheet, three steps; nothing is written until the final Save. Then the salary entry (dated today, category Salary, rate frozen as usual), the plan close and the new plan are written together, with one Undo toast that reverts all of them.
- The new plan's salary field starts at the amount received (its GHS value at the entry's rate if it went into USD) and stays editable: it is the plan's budget number, not the entry.
- Home nudge: shown once a plan exists, when the most recent usual payday (on or before today) has passed and no plan started on or after 10 days before it (the same early-salary window). It opens the same sheet.

**Reconcile** (per account):
1. Shows computed balance. User types actual balance.
2. Live drift = actual − computed, coloured.
3. Save: inserts a `reconciliations` row; if drift ≠ 0, inserts an `adjust` entry for the drift (category Other, note "Reconcile") so the balance matches reality from now on.

**Recurring**:
- Item is "due" if `day_of_month ≤ today` and no entry with its `recurring_id` exists in the current plan period. Post = create the entry. Skip = nothing (stays due until period ends; acceptable).

Phase 5 rulings (2026-10-27):
- *Reconcile* is dated today. The actual balance must be typed (empty is not 0) and may be negative (an overdrawn bank). Drift 0 shows green ("matches"); any other drift shows orange with the adjustment Save will make. The adjust entry uses the live category named Other (else the first live non-income category), the note "Reconcile" in the UI language, and the effective rate now. One Undo toast removes both the check and its adjustment.
- Adjustments only fix balances. Envelopes, safe to spend and the weekly limit count `out` entries only (§5), so an adjustment never moves them.
- An adjustment opens in History like any entry: its amount keeps its sign (e.g. −35) and can be edited or deleted. Deleting it leaves the check in the drift history.
- *Drift trend*: for every account with at least two checks, compare the size of its latest drift with the one before (missing and extra money both count; USD at today's rate). Totals equal → "drift steady", smaller → "drift shrinking", larger → "drift growing, mostly Cash" (naming the account with the largest latest drift). If every latest drift is 0 → "last checks matched". With no account checked twice, no trend line.
- *Recurring due* (asked 2026-10-27): an item falls on its day of the month (short months use their last day) inside the plan's period. That is usually once. It is twice when a plan runs longer than a month (salary early or late), so a bill is never skipped. Each date is due from that day until posted or until the plan ends. A plan's period runs from its start to its payday, or to today while the salary is late. With no plan, the period is the calendar month. Posted entries are live entries with the item's `recurring_id` dated from its first date in the period to the period's end. The salary day ends one period and starts the next, so a late bill posted that day doesn't count for the new plan's later date. The item is due while fewer posted entries exist than dates already reached.
- *Post* is one tap: an entry dated today with the item's type, amount, account and category, the item's name as its note, `recurring_id` set and the effective rate now. Undo toast. A bill that came in different is edited in History afterwards. There is no Skip button (skipping = not tapping).
- Home's Due card sits between the envelopes and today's entries (§6 order). Tapping a balance card opens Reconcile for that account.

**Undo**: Save/Delete/Post show a toast with Undo for 5 s. Undo soft-deletes (or restores) the entry. Toast dismissal is not a sync barrier.

---

## 8. Offline and sync

- Dexie tables mirror Supabase tables. UI reads from Dexie only.
- Every write goes to Dexie first, then into an `outbox` table; a sync worker flushes the outbox to Supabase whenever online (and on app focus).
- Pull: on start and every 60 s while visible, fetch rows with `updated_at > last_sync` per table, merge last-write-wins by `updated_at`.
- Conflicts are rare (one user); last-write-wins is acceptable. In practice it is "last push wins": the server stamps `updated_at` on arrival, so a device that was offline for a long time can overwrite a newer change made elsewhere.
- Soft deletes sync like updates.
- Show a small "n unsynced" indicator in the header when the outbox is non-empty.

Phase 6 hardening (2026-10-27):
- Sync never talks to the server without a signed-in session. If the login can't be refreshed (offline, flaky network), supabase-js would otherwise send the request with only the public key, and the server would refuse the rows. In that case nothing is pushed or pulled and the outbox waits.
- Only data errors count as permanent (Postgres classes 22 and 23: a bad value, a broken check, a missing parent). Permission, login and schema errors keep the rows queued and are retried; the "n unsynced" chip stays until they go through. An offline change is never dropped because of a login problem.
- A row the server permanently rejects is set aside. The device then re-reads that table in full on the same sync, so its copy matches the server again: a rejected edit is reverted, and a rejected new row stays only on this device.
- The two-device check is automated (two local databases sharing one fake server: offline phone, online laptop, reconnect, deletes, same-row edits) and done once by hand on the real phone and laptop.

---

## 9. FX rate

- `rate_mode = auto`: a Supabase Edge Function runs daily via cron, fetches USD→GHS from a free API (e.g. `open.er-api.com/v6/latest/USD`), upserts `rates(date, usd_ghs, source)`. Client reads the latest row. If the API fails, the previous day's row stays current and the footer shows the date.
- `rate_mode = manual`: `settings.manual_rate`, shown as "manual" in the footer, stays until changed.
- Every new entry stores the effective rate at creation. Editing an entry does not change its stored rate unless the user explicitly taps "update rate" on the edit sheet.
- No transfer/exchange feature. USD and GHS never move between each other in the app.
- Phase 1 note (2026-10-26): until FX exists, entries are stored with `rate_usd_ghs = 1`, which means "no rate yet" (a real USD/GHS rate is never 1). Phase 2 runs a one-time repair that replaces 1 with the rate of each entry's date. That repair is not a user edit, so §9's "update rate" rule doesn't apply to it. Phase 2 (2026-10-26): the same repair keeps running, on each device right after a successful sync, for any live entry saved while no rate existed (offline before the first daily rate, or manual mode never set). The footer and Settings call auto mode "daily".

---

## 10. Build order (Claude Code)

Each phase ends with the app runnable on the phone via the deployed URL. Do not start the next phase until the current one is used for a day.

0. **Skeleton.** Repo, Vite + React + TS, PWA plugin, routing, dark theme, i18n scaffold (EN/AR, RTL). Supabase project, schema migration from §4, RLS, email + password login, seed categories on first login. Deploy.
1. **Ledger.** Accounts, entries, balances, Add sheet (amount/toggle/account/category/note/date), History with search/filter, edit/delete, Undo toast, quick tiles. Unit tests for `money.ts`.
2. **FX display.** Rates table, cron edge function, manual mode, frozen rate per entry, equivalents everywhere, footer rate line.
3. **Plan.** Plans + envelopes, Plan screen, Safe-to-spend, weekly limit, live impact line in Add, envelope list on Home.
4. **Salary flow.** Salary received, month close summary, leftover handling, payday nudge.
5. **Trust.** Reconcile + adjustment + drift history. Recurring + due banner.
6. **Offline.** Dexie mirror, outbox, sync worker, unsynced indicator. Install on phone and laptop; verify an entry made offline on the phone shows on the laptop after reconnect. (Note 2026-10-26: the Dexie mirror, outbox, push/pull sync and the unsynced chip shipped in phase 1, because CLAUDE.md requires the UI to read only from Dexie. Phase 6 keeps offline hardening and the two-device check.)
7. **v2 (not now):** Web Push on Android/desktop for weekly-limit and payday nudges (edge function + cron + VAPID). Export to CSV.

---

## 11. Out of scope

Charts beyond simple bars, receipt OCR, bank/MoMo import, AI categorisation, multi-user, sharing, currency exchange entries, investment tracking, notifications (until v2).
