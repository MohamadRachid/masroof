# CLAUDE.md

Personal expense tracker for one user (Ali). PWA, React + Vite + TypeScript, Supabase. Android phone + laptop share one database.

## Read first
`SPEC.md` is the contract. Build exactly what it says, in the phase order of §10. If a request conflicts with SPEC.md, say so and stop; do not silently deviate. If something is missing from the spec, ask, then add it to SPEC.md before coding it.

## Rules that override everything
1. Adding an expense must stay under 10 seconds, one tap after typing the amount when defaults fit.
2. Amounts are stored in their own currency. Never convert a stored amount. The FX rate is display only; each entry freezes the rate at creation.
3. Nothing posts money on its own (salary, recurring, adjustments). Nudge, never act.
4. Warnings appear live in the Add form, not after.
5. Undo toasts, not confirm dialogs (except "delete all data").

## Phase discipline
- Work on one phase at a time. Finish, deploy, stop. Do not start the next phase unless told to.
- Every phase ends with the app runnable on the phone from the deployed URL.
- Current phase: see the top of `PROGRESS.md` (create it in phase 0; one line per phase: status + date).

## Project layout
```
src/
  lib/money.ts        pure functions: balance, envelopes, safeToSpend, weeklyLimit — unit-tested, no React, no Supabase
  lib/fx.ts           effective rate, equivalents
  lib/db.ts           Dexie schema (mirror of Supabase tables) + outbox
  lib/sync.ts         push outbox / pull updated rows
  lib/supabase.ts     client
  i18n/en.ts, ar.ts   all UI strings; no hardcoded text in components
  screens/            Home, Add, History, Plan, More, Login, FirstRun
  components/         small, dumb, no data fetching
supabase/
  migrations/         one file per change, never edit an applied migration
  functions/          edge functions (fx-daily)
SPEC.md  CLAUDE.md  PROGRESS.md
```

## Conventions
- TypeScript strict. No `any`. Money is `number` in major units with 2-decimal rounding via `round2()` in money.ts; never do arithmetic on raw inputs elsewhere.
- Dates: entries use `YYYY-MM-DD` strings in the user's local day. Never store an entry date as a timestamp.
- IDs: client-generated UUIDs (`crypto.randomUUID()`), so offline inserts are idempotent.
- Soft delete only (`deleted_at`). All queries filter it out.
- UI reads from Dexie only; writes go Dexie → outbox → Supabase. Never call Supabase directly from a component.
- Styling: one approach (CSS modules or Tailwind), decided in phase 0, documented here afterwards. No component library.
- Mobile-first, dark default, RTL must not break layout — check AR after every screen change.
- Latin digits in both languages.

## Commands
```
npm run dev          local dev
npm run test         vitest (money.ts must stay green)
npm run build        production build
npm run typecheck
supabase db push     apply migrations (or via Supabase MCP)
```

## Do not
- Add features not in SPEC.md (charts, OCR, bank import, AI categorisation, exchange/transfer entries, multi-user).
- Add a UI library, state library, or form library. React state + Dexie live queries is enough.
- Change the schema without a new migration file and a matching Dexie version bump.
- Run `supabase db reset` or anything destructive against the remote project.
- Commit `.env*`. Supabase URL and anon key go in `.env.local`; a `.env.example` is committed.

## Done means
- Typecheck and tests pass.
- Works on phone viewport (390px) and desktop, in EN and AR.
- Deployed; PROGRESS.md updated.
