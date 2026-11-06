-- SPEC §4 (2026-11-06): five more default categories, for everyone.
--   Weekly food allowance (fixed: paid every Sunday for the coming week's lunches)
--   Football, Padel, Barbershop, Transfer (money sent to someone) (variable)
-- New accounts get them from the signup trigger. Existing accounts get them below, each with
-- a 0 envelope in the open plan, the same as adding a category in the app. Anyone who already
-- has a live category with that name (English or Arabic, any case) keeps theirs: no duplicate.
-- The sort values slot each one next to its neighbours in the default list.

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
      (new.id, 'Rent',                  'إيجار',             'fixed',    'home',      10),
      (new.id, 'Bills',                 'فواتير',            'fixed',    'bolt',      20),
      (new.id, 'Data/Phone',            'إنترنت/هاتف',       'fixed',    'phone',     30),
      (new.id, 'Weekly food allowance', 'مصروف طعام أسبوعي', 'fixed',    'sandwich',  35),
      (new.id, 'Food',                  'طعام',              'variable', 'utensils',  40),
      (new.id, 'Groceries',             'بقالة',             'variable', 'basket',    50),
      (new.id, 'Transport',             'مواصلات',           'variable', 'bus',       60),
      (new.id, 'Fun',                   'ترفيه',             'variable', 'sparkle',   70),
      (new.id, 'Football',              'كرة قدم',           'variable', 'ball',      72),
      (new.id, 'Padel',                 'بادل',              'variable', 'racket',    74),
      (new.id, 'Health',                'صحة',               'variable', 'heart',     80),
      (new.id, 'Barbershop',            'حلاق',              'variable', 'scissors',  85),
      (new.id, 'Family',                'عائلة',             'variable', 'users',     90),
      (new.id, 'Transfer',              'تحويل',             'variable', 'handCoins', 95),
      (new.id, 'Buffer',                'احتياطي',           'variable', 'shield',    100),
      (new.id, 'Savings',               'ادخار',             'savings',  'piggy',     110),
      (new.id, 'Salary',                'راتب',              'income',   'wallet',    120),
      (new.id, 'Other',                 'أخرى',              'variable', 'dots',      130);
  end if;

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

with added (name_en, name_ar, kind, icon, sort) as (
  values
    ('Weekly food allowance', 'مصروف طعام أسبوعي', 'fixed',    'sandwich',  35),
    ('Football',              'كرة قدم',           'variable', 'ball',      72),
    ('Padel',                 'بادل',              'variable', 'racket',    74),
    ('Barbershop',            'حلاق',              'variable', 'scissors',  85),
    ('Transfer',              'تحويل',             'variable', 'handCoins', 95)
),
new_categories as (
  insert into public.categories (user_id, name_en, name_ar, kind, icon, sort)
  select u.id, a.name_en, a.name_ar, a.kind, a.icon, a.sort
  from auth.users u
  cross join added a
  where not exists (
    select 1
    from public.categories c
    where c.user_id = u.id
      and c.deleted_at is null
      and (lower(btrim(c.name_en)) in (lower(a.name_en), a.name_ar)
        or lower(btrim(c.name_ar)) in (lower(a.name_en), a.name_ar))
  )
  returning id, user_id
)
insert into public.plan_envelopes (user_id, plan_id, category_id, amount)
select n.user_id, p.id, n.id, 0
from new_categories n
join public.plans p on p.user_id = n.user_id and p.closed_at is null and p.deleted_at is null;
