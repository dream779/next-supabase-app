import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. BYPASSES RLS.
 *
 * ⚠️ ONLY use in scripts that run outside user context (e.g. seed-and-query.ts).
 * NEVER use in Server Actions or Route Handlers — that breaks per-user isolation.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env'
    )
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}