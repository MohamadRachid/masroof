-- Daily FX rate (SPEC §9): call the fx-daily edge function every 6 hours.
-- The function skips once today's rate is stored, so extra runs are retries,
-- not extra fetches. The anon JWT it needs lives in Vault ('fx_daily_anon_key'),
-- created outside this file so no key is committed.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'fx-daily',
  '5 */6 * * *',
  $$
  select net.http_post(
    url := 'https://uejpxzrcyigxknmwbzae.supabase.co/functions/v1/fx-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fx_daily_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
