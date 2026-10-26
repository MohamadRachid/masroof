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
- UI reads from Dexie only (hooks in `src/lib/data.tsx`); writes go through `src/lib/store.ts` → `queueRows` (Dexie + outbox) → `src/lib/sync.ts` push. Never call Supabase directly from a component.
- `useLiveQuery` returns undefined both while loading and for an empty result: for single-row lookups return `?? null`.
- One Dexie DB per user (`masroof_<userId>`). Bump `db.version()` with every schema migration. Push never sends `updated_at` (server stamps it); pull uses `updated_at > cursor` per table.
- Styling: CSS Modules + tokens in `src/styles/tokens.css`. Logical properties only (`margin-inline-start`, `inset-inline-end`…), never left/right. No component library.
- Mobile-first, dark default, RTL must not break layout — check AR after every screen change.
- Latin digits in both languages (`Intl` locale `ar-u-nu-latn`, see `src/i18n/format.ts`).
- Tests import pure modules only (never `lib/supabase.ts`); CI has no `.env.local`.

## Design system
- Colour means something: warm monochrome UI; `--good/--warn/--bad` only for status, plus money-in. One `--primary` button per screen.
- Amounts ≥24px use `.num-display` (Instrument Serif); list amounts use `.num` (tabular, LTR-isolated). Arabic text never goes in `--font-num`.
- Motion: `--ease-out` / `--ease-drawer`, ≤280ms; things seen tens of times a day (tabs) fade only; press = `scale(.97)`; hover only inside `(hover: hover) and (pointer: fine)`.
- Icons: `src/components/Icon.tsx` (Lucide paths). Directional icons auto-flip in RTL. Category icon keys are stored in `categories.icon`.
- Reuse `Sheet` (drag/Esc/Back to close), `Button`, `EmptyState`, `Screen`. Each tab sits in an `ErrorBoundary`.

## Hosting, routing, PWA
- Live: https://mohamadrachid.github.io/masroof/ — `.github/workflows/deploy.yml` deploys on push to `main`; Supabase URL + publishable key are repo variables.
- Base is `/masroof/` for `build` and `preview`, `/` for `dev`.
- Hash router `src/lib/router.ts`: `tabNavAction()` keeps history at most [Home, tab] (push leaving Home, replace between tabs, `history.back()` returning Home), so Back → Home → exit; `navigate('add')` pushes so Android Back closes the sheet; non-`#/` hashes (magic-link tokens) map to Home.
- Session gate never waits on the network: `useSession` starts from the stored session (`src/lib/sessionState.ts`); only `SIGNED_OUT` shows Login. All Supabase requests time out after 15s (`fetchTimeout.ts`).
- PWA uses `registerType: 'prompt'`: never auto-reload; `UpdatePrompt` asks.

## Supabase
- Project ref `uejpxzrcyigxknmwbzae` (London). Never touch the org's other project `maallem`.
- After `apply_migration` via MCP: rename the local file to the version from `list_migrations`, regenerate `src/lib/database.types.ts`, run `get_advisors`.
- RLS: select/insert/update own rows; no delete policy (soft delete is enforced by the DB). `rates` is global, read-only to users. New users get categories + settings from trigger `private.handle_new_user`.
- Test RLS with a rollback-only `do $$ … raise exception 'RESULT …' $$` block: fake `auth.users` rows, `set local role authenticated`, `request.jwt.claims`.
- Sign-in is email + password (`src/lib/auth.ts` signIn/signUp). "Confirm email" must stay off; sign-ups off after the owner exists. Built-in mailer can't edit templates (needs custom SMTP) and sends 2 emails/hour, so never build email-based flows.
- Auth dashboard settings can't be set via MCP; ask Ali. Deleting auth users via MCP needs his explicit OK at the prompt.
- FX: edge function `fx-daily` (supabase/functions, deploy via MCP, verify_jwt on) is called every 6 h by pg_cron job `fx-daily`; the anon JWT it sends is in Vault as `fx_daily_anon_key` (never commit it). Rate 1 on an entry = "no rate yet" (`isRealRate`); `repairPlaceholderRates` fixes those locally.

## Commands
```
npm run dev              local dev (restart after vite.config/define changes)
npm run test             vitest (money.ts must stay green)
npm run build            production build
npm run preview          serve the build at http://localhost:4173/masroof/ (SW + offline testable)
npm run typecheck
npx pwa-assets-generator regenerate icons from public/logo.svg
supabase db push         apply migrations (or via Supabase MCP)
```

## Gotchas
- Windows: stopping a background `npm run dev` task leaves node holding the port; kill the PID on 5173/4173.
- Playwright screenshots must be saved under `.playwright-mcp/` (git-ignored). For signed-in screens, write a fake session to `localStorage['masroof.auth']` (local only; no server calls).
- Public repo: commits use the GitHub noreply email (repo-local git config).

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
