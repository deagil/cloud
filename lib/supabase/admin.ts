import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Admin client using the service role key — bypasses Row Level Security.
 * Use ONLY for server-side operations where RLS is intentionally bypassed:
 * - Webhook handlers (no user session)
 * - Background job execution
 * - Cross-workspace admin operations
 *
 * Note: Returns an untyped SupabaseClient. Use explicit type assertions at call sites.
 * Once the Supabase project is provisioned, regenerate types with:
 *   supabase gen types typescript --local > lib/types/database.ts
 *
 * Never expose this client to the browser.
 */
export function createAdminClient(): SupabaseClient {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is required')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required')
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
