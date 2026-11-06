-- SPEC §12 success criteria 1 to 4 and 6, on the real database. Changes nothing: it always ends
-- with an error, and that error rolls every test row back. Paste it into the Supabase SQL Editor.
--   "RESULT ok ..."      everything passed
--   "RESULT FAILED ..."  something is wrong; don't turn sign-ups on

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  tables text[] := array['accounts', 'categories', 'recurring', 'entries', 'plans', 'plan_envelopes', 'reconciliations', 'settings'];
  t text;
  n bigint;
  refused boolean;
  others_before bigint;
  account uuid;
  category uuid;
  plan uuid;
begin
  -- Test values for the gate. Rolled back, so the real code and limit stay as they are.
  update private.signup_gate set invite_code = 'Test-Code', max_users = (select count(*) from auth.users) + 2;
  select count(*) into others_before from public.entries;

  -- An empty code can't be set: it would match a request that sends an empty code.
  refused := false;
  begin
    update private.signup_gate set invite_code = '  ';
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'RESULT FAILED: an empty invite code can be set'; end if;

  -- ── 2. A wrong or missing code is refused, at the server ─────────────
  refused := false;
  begin
    insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'wrong@test.invalid', '{"invite_code": "nope"}');
  exception when others then refused := sqlerrm = 'signup refused';
  end;
  if not refused then raise exception 'RESULT FAILED: a wrong code was accepted'; end if;

  refused := false;
  begin
    insert into auth.users (id, email) values (gen_random_uuid(), 'none@test.invalid');
  exception when others then refused := sqlerrm = 'signup refused';
  end;
  if not refused then raise exception 'RESULT FAILED: a missing code was accepted'; end if;

  -- ── 1. The right code works (spaces and capitals don't matter), and starts fresh ──
  insert into auth.users (id, email, raw_user_meta_data) values (a, 'a@test.invalid', '{"invite_code": " test-code "}');
  insert into auth.users (id, email, raw_user_meta_data) values (b, 'b@test.invalid', '{"invite_code": "Test-Code", "x": 1}');
  if (select count(*) from public.categories where user_id = a) <> 18 then raise exception 'RESULT FAILED: a new account did not get its categories'; end if;
  if (select count(*) from public.settings where user_id = a) <> 1 then raise exception 'RESULT FAILED: a new account did not get its settings'; end if;
  if (select count(*) from public.accounts where user_id = a) <> 0 then raise exception 'RESULT FAILED: a new account does not start empty'; end if;

  -- The code isn't kept on the account, also when auth writes the metadata back.
  if (select raw_user_meta_data ? 'invite_code' from auth.users where id = b) then raise exception 'RESULT FAILED: the code stayed on the account'; end if;
  update auth.users set raw_user_meta_data = '{"invite_code": "Test-Code", "x": 1}' where id = b;
  if (select raw_user_meta_data ? 'invite_code' from auth.users where id = b) then raise exception 'RESULT FAILED: the code came back on update'; end if;
  if (select raw_user_meta_data ->> 'x' from auth.users where id = b) is distinct from '1' then raise exception 'RESULT FAILED: other metadata was lost'; end if;

  -- ── 3. Past the limit, the right code is refused too ─────────────────
  refused := false;
  begin
    insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'full@test.invalid', '{"invite_code": "Test-Code"}');
  exception when others then refused := sqlerrm = 'signup refused';
  end;
  if not refused then raise exception 'RESULT FAILED: an account past the limit was accepted'; end if;

  -- ── 4. Each account has a row in every table; A can't touch B's ──────
  foreach n in array array[0, 1] loop
    perform set_config('request.jwt.claims', json_build_object('sub', case when n = 0 then a else b end, 'role', 'authenticated')::text, true);
    set local role authenticated;
    account := gen_random_uuid();
    plan := gen_random_uuid();
    select id into category from public.categories where kind = 'variable' limit 1;
    insert into public.accounts (id, name, currency, kind) values (account, 'Cash', 'GHS', 'cash');
    insert into public.recurring (name, type, account_id, amount, category_id, day_of_month) values ('Rent', 'out', account, 10, category, 1);
    insert into public.entries (date, type, account_id, amount, category_id, rate_usd_ghs) values ('2026-11-03', 'out', account, 5, category, 11.5);
    insert into public.plans (id, start_date, expected_end, salary) values (plan, '2026-11-01', '2026-11-25', 100);
    insert into public.plan_envelopes (plan_id, category_id, amount) values (plan, category, 50);
    insert into public.reconciliations (date, account_id, actual, computed, diff) values ('2026-11-03', account, 5, 5, 0);
    reset role;
  end loop;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  foreach t in array tables loop
    -- Read
    execute format('select count(*) from public.%I where user_id <> $1', t) into n using a;
    if n <> 0 then raise exception 'RESULT FAILED: A can read % rows of others in %', n, t; end if;
    execute format('select count(*) from public.%I where user_id = $1', t) into n using a;
    if n = 0 then raise exception 'RESULT FAILED: A can''t read its own rows in %', t; end if;

    -- Change
    execute format('update public.%I set updated_at = now() where user_id = $1', t) using b;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'RESULT FAILED: A changed % rows of B in %', n, t; end if;

    -- Add a row under B's name
    refused := false;
    begin
      execute format(
        $sql$insert into public.%1$I
             select (jsonb_populate_record(null::public.%1$I, to_jsonb(x) || jsonb_build_object('id', gen_random_uuid(), 'user_id', $1))).*
             from public.%1$I x where user_id = $2 limit 1$sql$, t) using b, a;
    exception when insufficient_privilege then refused := true;
    end;
    if not refused then raise exception 'RESULT FAILED: A added a row under B in %', t; end if;

    -- Hand its own row over to B
    refused := false;
    begin
      execute format('update public.%I set user_id = $1 where user_id = $2', t) using b, a;
    exception when insufficient_privilege then refused := true;
    end;
    if not refused then raise exception 'RESULT FAILED: A moved a row to B in %', t; end if;

    -- Hard delete is refused outright (soft delete only)
    refused := false;
    begin
      execute format('delete from public.%I where user_id = $1', t) using a;
    exception when insufficient_privilege then refused := true;
    end;
    if not refused then raise exception 'RESULT FAILED: A hard-deleted rows in %', t; end if;
  end loop;

  -- The code and the limit can't be read by a signed-in user.
  refused := false;
  begin
    perform 1 from private.signup_gate;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'RESULT FAILED: a signed-in user can read the invite code'; end if;
  reset role;

  -- Nobody signed in sees nothing.
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  refused := false;
  begin
    perform 1 from public.entries;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'RESULT FAILED: anon can read entries'; end if;
  reset role;

  -- ── 6. Deleting a user removes all of their rows and nobody else's ───
  delete from auth.users where id = a;
  foreach t in array tables loop
    execute format('select count(*) from public.%I where user_id = $1', t) into n using a;
    if n <> 0 then raise exception 'RESULT FAILED: % rows of the deleted user stayed in %', n, t; end if;
    execute format('select count(*) from public.%I where user_id = $1', t) into n using b;
    if n = 0 then raise exception 'RESULT FAILED: deleting A removed B''s rows in %', t; end if;
  end loop;
  if (select count(*) from public.entries where user_id <> b) <> others_before then raise exception 'RESULT FAILED: other people''s entries changed'; end if;

  raise exception 'RESULT ok: all checks passed. Nothing was changed.';
end;
$$;
