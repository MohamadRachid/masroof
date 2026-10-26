import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { withTimeout } from './fetchTimeout'

export const AUTH_STORAGE_KEY = 'masroof.auth'
const REQUEST_TIMEOUT_MS = 15_000

// Only src/lib talks to Supabase; components go through lib functions.
export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    global: { fetch: withTimeout((...args) => fetch(...args), REQUEST_TIMEOUT_MS) },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Implicit flow: the email link works in whichever browser opens it.
      flowType: 'implicit',
      storageKey: AUTH_STORAGE_KEY,
    },
  },
)
