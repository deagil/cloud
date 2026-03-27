import { cache } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getProfileByUserId } from '@/lib/db/profiles'
import type { AuthProvider, Session } from '@/lib/session/types'

function authProviderFromSupabaseUser(user: SupabaseUser): AuthProvider {
  const meta = user.app_metadata?.provider
  if (meta === 'github') return 'github'
  if (meta === 'email') return 'email'
  const identity = user.identities?.[0]?.provider
  if (identity === 'github') return 'github'
  if (identity === 'email') return 'email'
  return 'email'
}

/**
 * Compatibility shim — returns the same Session shape as the old JWE-based session,
 * but backed by Supabase Auth. All existing API routes continue to work unchanged.
 *
 * The user.id is now a UUID (from auth.users) rather than a nanoid.
 */
export const getServerSession = cache(async (): Promise<Session | undefined> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return undefined

  const profile = await getProfileByUserId(user.id)

  return {
    created: Date.now(),
    authProvider: authProviderFromSupabaseUser(user),
    user: {
      id: user.id,
      username: profile?.username ?? user.user_metadata?.user_name ?? '',
      email: user.email ?? undefined,
      avatar: profile?.avatarUrl ?? user.user_metadata?.avatar_url ?? '',
      name: profile?.name ?? user.user_metadata?.full_name ?? undefined,
    },
  }
})
