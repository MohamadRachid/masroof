-- Masroof — initial schema (SPEC.md §4).
-- Conventions: client-generated uuids, soft delete via deleted_at (no hard
-- delete is permitted to app users), updated_at maintained by trigger,
-- RLS on every table scoped to auth.uid().

create schema if not exists private;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Tables ──────────────────────────────────────────────────────────────

create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null,
  currency        text not null check (currency in ('GHS', 'USD')),
  kind            text not null,
  opening_balance numeric(14,2) not null default 0,
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name_en     text not null,
  name_ar     text not null,
  kind        text not null check (kind in ('fixed', 'variable', 'income', 'savings')),
  icon        text not null default 'dots',
  sort        int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.recurring (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  type         text not null check (type in ('in', 'out')),
  account_id   uuid not null references public.accounts (id),
  amount       numeric(14,2) not null check (amount > 0),
  category_id  uuid not null references public.categories (id),
  day_of_month int not null check (day_of_month between 1 and 31),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table public.entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date          date not null,
  type          text not null check (type in ('in', 'out', 'adjust')),
  account_id    uuid not null references public.accounts (id),
  amount        numeric(14,2) not null,
  category_id   uuid not null references public.categories (id),
  note          text,
  rate_usd_ghs  numeric(10,4) not null check (rate_usd_ghs > 0),
  recurring_id  uuid references public.recurring (id),
  client_id     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  -- in/out are positive; adjust carries a sign and is never zero.
  constraint entries_amount_sign check (
    (type = 'adjust' and amount <> 0) or (type <> 'adjust' and amount > 0)
  )
);

create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  start_date    date not null,
  expected_end  date not null,
  salary        numeric(14,2) not null check (salary >= 0),
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint plans_dates check (expected_end >= start_date)
);

create table public.plan_envelopes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id      uuid not null references public.plans (id),
  category_id  uuid not null references public.categories (id),
  amount       numeric(14,2) not null default 0 check (amount >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table public.reconciliations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  account_id  uuid not null references public.accounts (id),
  actual      numeric(14,2) not null,
  computed    numeric(14,2) not null,
  diff        numeric(14,2) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- Global reference data written by the daily FX cron (service role), read by
-- every signed-in user. One row per day, so it has no user_id.
create table public.rates (
  id          uuid primary key default gen_random_uuid(),
  date        date not null unique,
  usd_ghs     numeric(10,4) not null check (usd_ghs > 0),
  source      text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.settings (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  lang         text not null default 'en' check (lang in ('en', 'ar')),
  rate_mode    text not null default 'auto' check (rate_mode in ('auto', 'manual')),
  manual_rate  numeric(10,4) check (manual_rate > 0),
  usual_payday int not null default 25 check (usual_payday between 1 and 31),
  warn_pct     int not null default 80 check (warn_pct between 1 and 100),
  week_start   int not null default 1 check (week_start between 0 and 6),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

comment on table public.rates is 'Global USD→GHS rate per day, written by the fx-daily edge function.';
comment on column public.entries.rate_usd_ghs is 'Effective rate frozen at creation; display only, never used to convert the stored amount.';

-- ── Indexes ─────────────────────────────────────────────────────────────

-- (user_id, updated_at): RLS filter + incremental sync pull.
create index accounts_user_updated_idx        on public.accounts (user_id, updated_at);
create index categories_user_updated_idx      on public.categories (user_id, updated_at);
create index recurring_user_updated_idx       on public.recurring (user_id, updated_at);
create index entries_user_updated_idx         on public.entries (user_id, updated_at);
create index plans_user_updated_idx           on public.plans (user_id, updated_at);
create index plan_envelopes_user_updated_idx  on public.plan_envelopes (user_id, updated_at);
create index reconciliations_user_updated_idx on public.reconciliations (user_id, updated_at);
create index rates_updated_idx                on public.rates (updated_at);

-- Foreign keys.
create index recurring_account_idx       on public.recurring (account_id);
create index recurring_category_idx      on public.recurring (category_id);
create index entries_account_idx         on public.entries (account_id);
create index entries_category_idx        on public.entries (category_id);
create index entries_recurring_idx       on public.entries (recurring_id);
create index plan_envelopes_plan_idx     on public.plan_envelopes (plan_id);
create index plan_envelopes_category_idx on public.plan_envelopes (category_id);
create index reconciliations_account_idx on public.reconciliations (account_id);

-- One live envelope per category per plan.
create unique index plan_envelopes_one_per_category
  on public.plan_envelopes (plan_id, category_id)
  where deleted_at is null;

-- ── updated_at triggers ─────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'recurring', 'entries', 'plans',
    'plan_envelopes', 'reconciliations', 'rates', 'settings'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function private.set_updated_at()', t);
  end loop;
end;
$$;

-- ── Row level security ──────────────────────────────────────────────────
-- Select / insert / update on own rows only. No delete policy: the app
-- soft-deletes, and the database refuses hard deletes from app users.

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'recurring', 'entries', 'plans',
    'plan_envelopes', 'reconciliations', 'settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows: select" on public.%I for select to authenticated
         using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "own rows: insert" on public.%I for insert to authenticated
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "own rows: update" on public.%I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke delete, truncate, references, trigger on table public.%I from authenticated', t);
  end loop;
end;
$$;

alter table public.rates enable row level security;
create policy "signed in: read rates" on public.rates for select to authenticated using (true);
revoke all on table public.rates from anon;
revoke insert, update, delete, truncate, references, trigger on table public.rates from authenticated;

-- ── Seed defaults for a new user ────────────────────────────────────────
-- Runs inside the signup transaction, so phone and laptop can never both seed.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  if not exists (select 1 from public.categories where user_id = new.id) then
    insert into public.categories (user_id, name_en, name_ar, kind, icon, sort) values
      (new.id, 'Rent',       'إيجار',        'fixed',    'home',     10),
      (new.id, 'Bills',      'فواتير',       'fixed',    'bolt',     20),
      (new.id, 'Data/Phone', 'إنترنت/هاتف',  'fixed',    'phone',    30),
      (new.id, 'Food',       'طعام',         'variable', 'utensils', 40),
      (new.id, 'Groceries',  'بقالة',        'variable', 'basket',   50),
      (new.id, 'Transport',  'مواصلات',      'variable', 'bus',      60),
      (new.id, 'Fun',        'ترفيه',        'variable', 'sparkle',  70),
      (new.id, 'Health',     'صحة',          'variable', 'heart',    80),
      (new.id, 'Family',     'عائلة',        'variable', 'users',    90),
      (new.id, 'Buffer',     'احتياطي',      'variable', 'shield',   100),
      (new.id, 'Savings',    'ادخار',        'savings',  'piggy',    110),
      (new.id, 'Salary',     'راتب',         'income',   'wallet',   120),
      (new.id, 'Other',      'أخرى',         'variable', 'dots',     130);
  end if;

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;
revoke execute on function private.set_updated_at() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
