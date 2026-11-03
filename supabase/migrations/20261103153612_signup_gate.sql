-- Friends (SPEC §12): up to 20 separate accounts. Sign-ups are on in the dashboard, so the
-- database is the lock: a new user needs the invite code, and the app must not be full.
-- The repo and the public key are public, so a check in the app alone would protect nothing.
--
-- The code is never in this public repo. It is set directly in the database after this runs:
--   update private.signup_gate set invite_code = '...';
-- Until then there is no code, and every sign-up is refused.

create table private.signup_gate (
  id          boolean primary key default true check (id),  -- one row only
  -- Null closes sign-ups. An empty code can't be stored: it would match a request that sends an empty code.
  invite_code text check (invite_code is null or btrim(invite_code) <> ''),
  max_users   int not null default 20 check (max_users > 0)
);

insert into private.signup_gate default values;

revoke all on table private.signup_gate from public, anon, authenticated;

create or replace function private.check_signup_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gate private.signup_gate%rowtype;
begin
  if tg_op = 'INSERT' then
    -- One sign-up at a time, so two at once can't both take the last place.
    perform pg_advisory_xact_lock(hashtext('masroof_signup_gate'));

    select * into gate from private.signup_gate where id;
    -- A wrong code and a full app are refused the same way (SPEC §12).
    if gate.invite_code is null
       or lower(trim(new.raw_user_meta_data ->> 'invite_code')) is distinct from lower(trim(gate.invite_code))
       or (select count(*) from auth.users) >= gate.max_users then
      raise exception 'signup refused';
    end if;
  end if;

  -- The code did its job; it isn't kept on the account. Auth writes the metadata again right
  -- after the insert, from its own copy, so this runs on updates too.
  new.raw_user_meta_data := new.raw_user_meta_data - 'invite_code';
  return new;
end;
$$;

revoke execute on function private.check_signup_gate() from public, anon, authenticated;

create trigger check_signup_gate
  before insert or update of raw_user_meta_data on auth.users
  for each row execute function private.check_signup_gate();
