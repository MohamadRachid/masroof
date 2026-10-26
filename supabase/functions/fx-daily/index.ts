// fx-daily: store today's USD→GHS rate in public.rates (SPEC §9).
// Called by pg_cron a few times a day; does nothing once today's row exists,
// so retries are cheap and a failed fetch leaves yesterday's rate in place.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SOURCE = 'open.er-api.com'
const API = 'https://open.er-api.com/v6/latest/USD'
// A wrong rate would be frozen into every entry made that day; refuse anything implausible.
const MIN_RATE = 1
const MAX_RATE = 1000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const today = new Date().toISOString().slice(0, 10)

  const { data: existing, error: readError } = await supabase.from('rates').select('date').eq('date', today).maybeSingle()
  if (readError) return json({ ok: false, error: readError.message }, 500)
  if (existing) return json({ ok: true, date: today, skipped: true })

  let rate: number
  let date: string
  try {
    const res = await fetch(API, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return json({ ok: false, error: `rate source answered ${res.status}` }, 502)
    const body = await res.json()
    rate = Number(body?.rates?.GHS)
    const updated = Number(body?.time_last_update_unix)
    date = Number.isFinite(updated) ? new Date(updated * 1000).toISOString().slice(0, 10) : today
    if (body?.result !== 'success' || !Number.isFinite(rate) || rate <= MIN_RATE || rate >= MAX_RATE) {
      return json({ ok: false, error: 'unexpected payload from rate source' }, 502)
    }
  } catch (err) {
    return json({ ok: false, error: `rate source unreachable: ${String(err)}` }, 502)
  }

  const usd_ghs = Math.round(rate * 10000) / 10000
  const { error } = await supabase.from('rates').upsert({ date, usd_ghs, source: SOURCE }, { onConflict: 'date' })
  if (error) return json({ ok: false, error: error.message }, 500)
  return json({ ok: true, date, usd_ghs })
})
