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
- **Auth:** email OTP (magic link). After the owner signs up once, sign-ups are disabled (Supabase dashboard → Auth → disable new users). RLS on every table: `user_id = auth.uid()`.
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

---

## 6. Screens

### Login
Email → OTP link. Once logged in, session persists; never asks again unless signed out.

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

### More
- Recurring: list + add/edit (name, in/out, amount, account, category, day of month). Due items also surface on Home.
- Reconcile: per account, last reconcile date + drift; tap → sheet. Drift history list (date, diff) with a one-line trend: "drift shrinking" / "drift growing, mostly Cash".
- Settings: language, rate mode + manual rate, usual payday, warn %, week start, accounts (name/opening), categories (add/rename/archive, set kind), export JSON, delete all data (typed confirmation).

---

## 7. Flows

**Salary received** (Plan screen, or Home nudge when `usual_payday` has passed and no plan started this month):
1. Enter salary amount and account (default bank). Creates an `in` entry, category Salary.
2. If a plan is open: show close summary — planned vs. actual per envelope, total over/under. Ask what to do with leftover variable money: *Move to Savings* (creates an envelope note, not a money move), *Add to next Buffer*, *Ignore*. Mark plan `closed_at`.
3. Create the new plan: `start_date` = today, `expected_end` = next `usual_payday`, envelopes prefilled from the previous plan (or defaults on first run). User edits, saves.

**Reconcile** (per account):
1. Shows computed balance. User types actual balance.
2. Live drift = actual − computed, coloured.
3. Save: inserts a `reconciliations` row; if drift ≠ 0, inserts an `adjust` entry for the drift (category Other, note "Reconcile") so the balance matches reality from now on.

**Recurring**:
- Item is "due" if `day_of_month ≤ today` and no entry with its `recurring_id` exists in the current plan period. Post = create the entry. Skip = nothing (stays due until period ends; acceptable).

**Undo**: Save/Delete/Post show a toast with Undo for 5 s. Undo soft-deletes (or restores) the entry. Toast dismissal is not a sync barrier.

---

## 8. Offline and sync

- Dexie tables mirror Supabase tables. UI reads from Dexie only.
- Every write goes to Dexie first, then into an `outbox` table; a sync worker flushes the outbox to Supabase whenever online (and on app focus).
- Pull: on start and every 60 s while visible, fetch rows with `updated_at > last_sync` per table, merge last-write-wins by `updated_at`.
- Conflicts are rare (one user); last-write-wins is acceptable.
- Soft deletes sync like updates.
- Show a small "n unsynced" indicator in the header when the outbox is non-empty.

---

## 9. FX rate

- `rate_mode = auto`: a Supabase Edge Function runs daily via cron, fetches USD→GHS from a free API (e.g. `open.er-api.com/v6/latest/USD`), upserts `rates(date, usd_ghs, source)`. Client reads the latest row. If the API fails, the previous day's row stays current and the footer shows the date.
- `rate_mode = manual`: `settings.manual_rate`, shown as "manual" in the footer, stays until changed.
- Every new entry stores the effective rate at creation. Editing an entry does not change its stored rate unless the user explicitly taps "update rate" on the edit sheet.
- No transfer/exchange feature. USD and GHS never move between each other in the app.

---

## 10. Build order (Claude Code)

Each phase ends with the app runnable on the phone via the deployed URL. Do not start the next phase until the current one is used for a day.

0. **Skeleton.** Repo, Vite + React + TS, PWA plugin, routing, dark theme, i18n scaffold (EN/AR, RTL). Supabase project, schema migration from §4, RLS, email OTP login, seed categories on first login. Deploy.
1. **Ledger.** Accounts, entries, balances, Add sheet (amount/toggle/account/category/note/date), History with search/filter, edit/delete, Undo toast, quick tiles. Unit tests for `money.ts`.
2. **FX display.** Rates table, cron edge function, manual mode, frozen rate per entry, equivalents everywhere, footer rate line.
3. **Plan.** Plans + envelopes, Plan screen, Safe-to-spend, weekly limit, live impact line in Add, envelope list on Home.
4. **Salary flow.** Salary received, month close summary, leftover handling, payday nudge.
5. **Trust.** Reconcile + adjustment + drift history. Recurring + due banner.
6. **Offline.** Dexie mirror, outbox, sync worker, unsynced indicator. Install on phone and laptop; verify an entry made offline on the phone shows on the laptop after reconnect.
7. **v2 (not now):** Web Push on Android/desktop for weekly-limit and payday nudges (edge function + cron + VAPID). Export to CSV.

---

## 11. Out of scope

Charts beyond simple bars, receipt OCR, bank/MoMo import, AI categorisation, multi-user, sharing, currency exchange entries, investment tracking, notifications (until v2).
