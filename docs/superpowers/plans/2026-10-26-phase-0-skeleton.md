# Phase 0 — Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, installable Masroof PWA where the owner signs in with an email code, lands in a polished dark EN/AR shell (Home · History · + · Plan · More), and the Supabase schema from SPEC §4 exists with RLS and seeded categories.

**Architecture:** Vite + React 18 + TS static SPA served from GitHub Pages under `/masroof/`, with a tiny hash router (no dependency, survives Pages and magic-link hashes). Supabase holds the schema; a `security definer` trigger on `auth.users` seeds categories + settings atomically at signup so two devices can't double-seed. Components never touch Supabase; `src/lib/auth.ts` wraps it.

**Tech Stack:** React 18.3, Vite, TypeScript strict, CSS Modules + CSS custom properties, vite-plugin-pwa, @supabase/supabase-js v2, Vitest, @fontsource fonts (self-hosted so they precache offline).

**Spec:** `SPEC.md` (§2, §4, §6 Login, §10 phase 0) and `CLAUDE.md`.

## Global Constraints

- React **18** (not 19). TypeScript strict, no `any`.
- No UI/component/state/form library. Router is hand-written (`src/lib/router.ts`).
- Styling: **CSS Modules** + tokens in `src/styles/tokens.css`. Use logical properties only (`margin-inline-start`, `inset-inline-end`, `padding-block`…) so RTL mirrors for free. Never `left/right` for layout.
- All UI strings in `src/i18n/en.ts` / `ar.ts`. Latin digits in both languages.
- Dark theme only (default per spec). Mobile-first; must work at 360–390px and desktop.
- Touch targets ≥ 44px. Respect `prefers-reduced-motion`. Honour `env(safe-area-inset-*)`.
- Supabase project ref `uejpxzrcyigxknmwbzae`, URL `https://uejpxzrcyigxknmwbzae.supabase.co`, publishable key in `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). `.env*` git-ignored except `.env.example`.
- Migrations: `supabase/migrations/<timestamp>_<name>.sql`, never edited after applying.
- App name **Masroof** / **مصروف**. Deployed at `https://mohamadrachid.github.io/masroof/`.

## Design System (decided; every task uses it)

Principle: **colour means something.** The UI is warm monochrome (charcoal + paper). Colour only appears for status (good/warn/bad) and money-in. Numbers get their own typeface.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0E0D0B` | page |
| `--surface-1/2/3` | `#171613` / `#201E1A` / `#2A2722` | cards, sheets, pressed |
| `--line` / `--line-strong` | `rgb(237 232 223 / .08)` / `/ .14` | hairlines |
| `--text` / `--text-2` / `--text-3` | `#EDE8DF` / `#A39D92` / `#6F6A61` | primary / secondary / disabled-only |
| `--good` / `--warn` / `--bad` | `#5BC489` / `#F0A04B` / `#EF6A5B` | status only |
| `--primary` / `--on-primary` | `#EDE8DF` / `#0E0D0B` | the one primary button per screen |
| `--font-ui` | Readex Pro Variable (Latin + Arabic) | all text |
| `--font-num` | Instrument Serif | amounts ≥ 24px, wordmark |
| `--r-1..4` | 10 / 14 / 20 / 28px | radii |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | all motion; 120 / 200 / 320ms |

Faint grain overlay on `body` (inline SVG noise, 3% opacity). Press feedback `scale(.97)`. Tab change: 8px rise + fade, 200ms. Sheet: slide-up 320ms, backdrop fade, drag-down or Back to close.

Layout: phone = top header (wordmark · unsynced slot · lang) + bottom tab bar `Home · History · (+) · Plan · More` with the + raised in the centre (reachable by either thumb, symmetric in RTL). ≥ 960px = inline-start rail (wordmark, 4 nav items, "Add" button) + content column max 720px.

## Review Focus

1. **Magic-link return** — Supabase lands on `/masroof/#access_token=…`. The router must treat any hash not starting with `#/` as Home, never a blank screen. → test in Task 3.
2. **Wrong / expired / rate-limited code** — show an inline, human message (and a resend countdown), never a raw error or a stuck spinner. → test in Task 4.
3. **Switching to AR** — `<html dir="rtl" lang="ar">` flips instantly, nav order mirrors, nothing overflows at 360px; choice survives reload. → test in Task 2, manual check in Task 5.
4. **Sub-path hosting** — assets, service-worker scope, manifest `start_url`/`scope` and the `#/add` shortcut all resolve under `/masroof/`; reloading `#/history` works. → check in Task 7.
5. **Offline open after install** — shell loads from the SW precache with no network; login shows "You're offline" instead of failing silently. → check in Task 6.

---

### Task 1: Project scaffold, tokens, git

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`, `src/styles/global.css`, `src/vite-env.d.ts`, `.gitignore`, `.env.example`, `.env.local`, `PROGRESS.md`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `preview`, `test` (`vitest run`), `typecheck` (`tsc -b --noEmit` or equivalent); CSS tokens above as custom properties on `:root`; `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` typed in `vite-env.d.ts`.

- [ ] **Step 1:** Scaffold with `npm create vite@latest . -- --template react-ts`, then pin `react@18.3.1 react-dom@18.3.1 @types/react@18 @types/react-dom@18`. Add `vitest`, `@fontsource-variable/readex-pro`, `@fontsource/instrument-serif`.
- [ ] **Step 2:** `vite.config.ts`: `base` = `'/masroof/'` for `build`, `'/'` for `serve`. `index.html`: `lang="en" dir="ltr"`, `<meta name="theme-color" content="#0E0D0B">`, `viewport-fit=cover`, `<meta name="color-scheme" content="dark">`.
- [ ] **Step 3:** Write `tokens.css` (table above) and `global.css` (reset, `html,body{background:var(--bg)}`, fonts, grain, `:focus-visible` ring in `--text`, `@media (prefers-reduced-motion: reduce)` zeroing durations, `font-variant-numeric: tabular-nums` utility class `.num`).
- [ ] **Step 4:** `.gitignore` includes `node_modules`, `dist`, `.env*`, `!.env.example`. `PROGRESS.md` first line: `Phase 0 — Skeleton: in progress (2026-10-26)`.
- [ ] **Step 5:** Run `npm run typecheck && npm run build`. Expected: both exit 0.
- [ ] **Step 6:** `git init -b main`, commit `chore: scaffold Vite + React 18 + TS`.

### Task 2: Database — schema, RLS, seed trigger, types

**Files:**
- Create: `supabase/migrations/20261026090000_init.sql`, `src/lib/database.types.ts` (generated)

**Interfaces:**
- Produces: tables exactly per SPEC §4 in `public`; type `Database` exported from `src/lib/database.types.ts`.

Decisions (fill gaps in §4; record them in SPEC.md §4 in Task 8):
- Every user table: `id uuid pk default gen_random_uuid()`, `user_id uuid not null default auth.uid() references auth.users on delete cascade`, `created_at`, `updated_at` (trigger `private.set_updated_at`), `deleted_at`. `settings` uses `user_id` as PK (per spec) plus the timestamp columns.
- `rates` is **global** reference data (spec gives it `date unique` and a cron writer, so it can't be per-user): no `user_id`; RLS `select` for `authenticated`; writes only via service role.
- RLS on every table, policies `to authenticated` using `(select auth.uid()) = user_id` for **select / insert / update only**. No delete policy — soft delete is enforced by the database.
- `entries`: `date`, `type`, `account_id`, `category_id`, `amount`, `rate_usd_ghs` are `not null`; check `(type = 'adjust' and amount <> 0) or (type <> 'adjust' and amount > 0)`.
- `recurring.type in ('in','out')`; `recurring.account_id/category_id` and `reconciliations.account_id` are real FKs.
- `settings` checks: `lang in ('en','ar')`, `usual_payday between 1 and 31`, `warn_pct between 1 and 100`, `week_start between 0 and 6`.
- `plan_envelopes`: partial unique `(plan_id, category_id) where deleted_at is null`.
- Indexes: `(user_id, updated_at)` on every user table (RLS + future sync pull) and every FK column.
- `private.handle_new_user()` (`security definer`, `search_path = ''`), trigger `after insert on auth.users`: inserts `settings` row and the 13 default categories from §4 with `name_ar` (إيجار، فواتير، إنترنت/هاتف، طعام، بقالة، مواصلات، ترفيه، صحة، عائلة، احتياطي، ادخار، راتب، أخرى), `icon` keys (`home, bolt, phone, utensils, basket, bus, sparkle, heart, users, shield, piggy, wallet, dots`) and `sort` 10, 20, …; skips if the user already has categories.

- [ ] **Step 1:** Write the migration file with all of the above.
- [ ] **Step 2:** Apply it via Supabase MCP `apply_migration` (name `init`).
- [ ] **Step 3:** Verify RLS and seeding in one SQL transaction that is rolled back: insert a fake `auth.users` row, `set local role authenticated` + `request.jwt.claims` for that id, then `select count(*) from categories` → expected `13`, `select count(*) from settings` → `1`; switch claims to a second fake id → `0` categories visible. `rollback`.
- [ ] **Step 4:** Run `get_advisors` (security + performance). Expected: no ERROR-level findings for our tables.
- [ ] **Step 5:** Generate types via MCP into `src/lib/database.types.ts`; `npm run typecheck` exits 0.
- [ ] **Step 6:** Commit `feat(db): schema, RLS, seed trigger`.

### Task 3: i18n + hash router

**Files:**
- Create: `src/i18n/en.ts`, `src/i18n/ar.ts`, `src/i18n/index.tsx`, `src/lib/router.ts`
- Test: `src/i18n/i18n.test.ts`, `src/lib/router.test.ts`

**Interfaces:**
- Produces:
  - `en` (flat object, `as const`), `type MsgKey = keyof typeof en`, `ar: Record<MsgKey, string>` (compile-time parity).
  - `interpolate(template: string, vars?: Record<string, string | number>): string` — replaces `{name}`.
  - `type Lang = 'en' | 'ar'`; `dirFor(lang: Lang): 'ltr' | 'rtl'`.
  - `I18nProvider`, `useI18n(): { lang: Lang; dir: 'ltr' | 'rtl'; t: (key: MsgKey, vars?) => string; setLang: (l: Lang) => void }`. Persists to `localStorage['masroof.lang']`, sets `document.documentElement.lang/dir`.
  - `type Route = 'home' | 'history' | 'plan' | 'more' | 'add'`; `parseHash(hash: string): Route`; `useRoute(): Route`; `navigate(route: Route): void` (sets `location.hash = '#/' + route`).

- [ ] **Step 1: Write the failing tests**

```ts
// i18n.test.ts
expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort())
expect(Object.values(ar).every(v => v.trim().length > 0)).toBe(true)
expect(interpolate('Week: {spent} / {limit}', { spent: 320, limit: 400 })).toBe('Week: 320 / 400')
expect(interpolate('Hi {x}', {})).toBe('Hi {x}')
expect(dirFor('ar')).toBe('rtl'); expect(dirFor('en')).toBe('ltr')

// router.test.ts
expect(parseHash('#/history')).toBe('history')
expect(parseHash('#/add')).toBe('add')
expect(parseHash('')).toBe('home')
expect(parseHash('#/nope')).toBe('home')
expect(parseHash('#access_token=abc&refresh_token=def&type=magiclink')).toBe('home')
expect(parseHash('#/plan?x=1')).toBe('plan')
```

- [ ] **Step 2:** `npm run test` → FAIL (modules missing).
- [ ] **Step 3:** Implement the interfaces above. `useRoute` subscribes to `hashchange`.
- [ ] **Step 4:** `npm run test` → PASS.
- [ ] **Step 5:** Commit `feat: i18n (EN/AR, RTL) and hash router`.

### Task 4: Supabase client, auth, Login screen

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/auth.ts`, `src/screens/Login.tsx`, `src/screens/Login.module.css`, `src/components/Splash.tsx`
- Test: `src/lib/auth.test.ts`

**Interfaces:**
- Consumes: `Database` (Task 2), `useI18n` (Task 3).
- Produces:
  - `supabase` — `createClient<Database>(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })` (implicit flow so the email link works in any browser).
  - `useSession(): { status: 'loading' | 'signedOut' | 'signedIn'; email: string | null }`.
  - `sendCode(email: string): Promise<AuthResult>`; `verifyCode(email: string, code: string): Promise<AuthResult>`; `signOut(): Promise<void>`.
  - `type AuthResult = { ok: true } | { ok: false; error: AuthErrorKey }`.
  - `type AuthErrorKey = 'invalidEmail' | 'badCode' | 'rateLimited' | 'offline' | 'unknown'`; `authErrorKey(err: { status?: number; code?: string; message?: string } | null, online: boolean): AuthErrorKey`.
  - `OTP_LENGTH = 6`; `RESEND_SECONDS = 60`.

- [ ] **Step 1: Write the failing test**

```ts
expect(authErrorKey({ status: 429 }, true)).toBe('rateLimited')
expect(authErrorKey({ code: 'over_email_send_rate_limit' }, true)).toBe('rateLimited')
expect(authErrorKey({ code: 'otp_expired', status: 403 }, true)).toBe('badCode')
expect(authErrorKey({ status: 400, message: 'Unable to validate email address: invalid format' }, true)).toBe('invalidEmail')
expect(authErrorKey({ message: 'Failed to fetch' }, false)).toBe('offline')
expect(authErrorKey({ status: 500 }, true)).toBe('unknown')
```

- [ ] **Step 2:** `npm run test` → FAIL.
- [ ] **Step 3:** Implement `auth.ts` and `supabase.ts`. `sendCode` passes `emailRedirectTo: location.origin + import.meta.env.BASE_URL`.
- [ ] **Step 4:** `npm run test` → PASS.
- [ ] **Step 5:** Build `Login`: step 1 email (`type=email`, `autocomplete=email`, autofocus, "Send code" primary, disabled until it looks like an email); step 2 "Enter the code sent to {email}" with a single `inputmode=numeric autocomplete=one-time-code maxLength=OTP_LENGTH` field rendered as 6 boxed digits, auto-verifies on the 6th digit, paste works; "or tap the link in the email"; Resend with live countdown; "Use a different email". Errors inline under the field via `t('auth.err.' + key)`. Offline banner when `navigator.onLine` is false. `Splash` = centred wordmark while `status === 'loading'`.
- [ ] **Step 6:** `npm run typecheck && npm run test` → exit 0. Commit `feat(auth): email code + magic link login`.

### Task 5: App shell, screens, sheet

**Files:**
- Create: `src/components/Shell.tsx` + `.module.css`, `src/components/Icon.tsx`, `src/components/Sheet.tsx` + `.module.css`, `src/components/EmptyState.tsx` + `.module.css`, `src/screens/Home.tsx`, `History.tsx`, `Plan.tsx`, `More.tsx` (+ one shared `Screen.module.css`)
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useRoute`, `navigate` (Task 3), `useI18n` (Task 3), `useSession`, `signOut` (Task 4).
- Produces:
  - `Icon({ name: IconName; size?: number })` — inline SVG, 1.75 stroke, `currentColor`; `IconName` includes the 13 category icons from Task 2 plus `plus, history, plan, more, globe, logout, chevron, close, cloudOff`. Chevron flips in RTL via `[dir=rtl] .flip { transform: scaleX(-1) }`.
  - `Sheet({ open: boolean; onClose: () => void; title: string; children })` — portal, focus trap, Esc/backdrop/drag-down close, pushes a history entry so Android Back closes it.
  - `EmptyState({ icon: IconName; title: string; body: string })`.

- [ ] **Step 1:** `App.tsx`: `I18nProvider` → `useSession` gate (`Splash` / `Login` / `Shell`). Route `add` renders Home with the sheet open; closing navigates to `home`.
- [ ] **Step 2:** `Shell`: header (wordmark in `--font-num`, reserved unsynced-count slot, EN/ع toggle), animated `<main>`, bottom tab bar with raised centre +, active tab = `--text` + label, inactive `--text-2`; desktop rail at ≥ 960px. `aria-current="page"` on active item.
- [ ] **Step 3:** Screens: Home/History/Plan show an `EmptyState` that says what will live there (copy in i18n, short, plain). More shows working rows: Language (EN / العربية segmented control), signed-in email, Sign out, app version. The + opens `Sheet` with a one-line "Adding entries arrives in the next update."
- [ ] **Step 4:** Run `npm run dev`; with Playwright at 390×844 and 1280×800, screenshot every screen in EN and AR. Expected: no horizontal scroll, nav mirrored in AR, tab bar clear of the gesture area, + sheet opens/closes (Esc, backdrop, Back).
- [ ] **Step 5:** `npm run typecheck && npm run test && npm run build` → exit 0. Commit `feat: app shell, navigation, screens`.

### Task 6: PWA

**Files:**
- Create: `public/logo.svg`, generated icons in `public/`, `src/components/UpdatePrompt.tsx`
- Modify: `vite.config.ts`, `src/main.tsx`

**Interfaces:**
- Produces: manifest `{ name: 'Masroof', short_name: 'Masroof', start_url: '.', scope: '.', display: 'standalone', theme_color: '#0E0D0B', background_color: '#0E0D0B', shortcuts: [{ name: 'Add expense', short_name: 'Add', url: './#/add' }] }`; workbox precaches `**/*.{js,css,html,svg,png,woff2}`.

- [ ] **Step 1:** Draw `logo.svg` (cream mark on `#0E0D0B`, paths only, no text) and generate icons with `@vite-pwa/assets-generator` (`minimal-2023` preset: 64/192/512, maskable 512, apple-touch 180, favicon).
- [ ] **Step 2:** Configure `vite-plugin-pwa` with `registerType: 'prompt'`; `UpdatePrompt` shows a small bottom toast "New version ready · Reload" (never auto-reloads mid-entry).
- [ ] **Step 3:** `npm run build && npm run preview`; in Playwright: manifest loads, SW registers, then go offline and reload → shell still renders and Login shows the offline banner.
- [ ] **Step 4:** Commit `feat(pwa): manifest, icons, offline shell, update prompt`.

### Task 7: Deploy to GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1:** `gh repo create MohamadRachid/masroof --public --source . --push`.
- [ ] **Step 2:** Store `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as repo **variables** (publishable, not secret). Workflow: on push to `main` → `npm ci`, `npm run typecheck`, `npm run test`, `npm run build` with those env vars → `actions/upload-pages-artifact` → `actions/deploy-pages`. Enable Pages with source = GitHub Actions (`gh api -X POST repos/MohamadRachid/masroof/pages -f build_type=workflow`).
- [ ] **Step 3:** Push, watch with `gh run watch`. Expected: green run.
- [ ] **Step 4:** Playwright against `https://mohamadrachid.github.io/masroof/` at 390px: login renders, icons/manifest 200, reload on `#/history` works.

### Task 8: Docs and hand-off

**Files:**
- Modify: `CLAUDE.md` (Styling line → "CSS Modules + tokens in `src/styles/tokens.css`, logical properties only"; add hosting/base-path note), `SPEC.md` §4 (note: `rates` global; seeding via `auth.users` trigger; no delete policy), `PROGRESS.md` (`Phase 0 — Skeleton: done (2026-10-26)` once the owner has logged in on the phone).

- [ ] **Step 1:** Update the three docs; commit and push `docs: phase 0 notes`.
- [ ] **Step 2:** Give the owner the dashboard checklist (can't be done via MCP): Auth → URL Configuration: Site URL `https://mohamadrachid.github.io/masroof/`, redirect URLs that plus `http://localhost:5173/`; Auth → Email Templates → Magic Link: include both `{{ .Token }}` and `{{ .ConfirmationURL }}` (template text provided); after first sign-in: Auth → Sign In / Providers → disable "Allow new users to sign up".
- [ ] **Step 3:** Owner signs in on the phone; confirm via SQL that their user has 13 categories and 1 settings row.
