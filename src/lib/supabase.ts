import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Only src/lib talks to Supabase; components go through lib functions.
export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Implicit flow: the email link works in whichever browser opens it.
      flowType: 'implicit',
      storageKey: 'masroof.auth',
    },
  },
)
