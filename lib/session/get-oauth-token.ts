import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'

type OAuthProvider = 'github' | 'vercel'

export async function getOAuthToken(
  userId: string,
  provider: OAuthProvider,
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: Date | null } | null> {
  try {
    const supabase = createAdminClient()

    if (provider === 'github') {
      const { data: account } = await supabase
        .from('accounts')
        .select('access_token, refresh_token, expires_at')
        .eq('user_id', userId)
        .eq('provider', 'github')
        .limit(1)
        .maybeSingle()

      if (account?.access_token) {
        return {
          accessToken: decrypt(account.access_token),
          refreshToken: account.refresh_token ? decrypt(account.refresh_token) : null,
          expiresAt: account.expires_at ? new Date(account.expires_at) : null,
        }
      }

      const { data: user } = await supabase
        .from('users')
        .select('access_token, refresh_token')
        .eq('id', userId)
        .eq('provider', 'github')
        .limit(1)
        .maybeSingle()

      if (user?.access_token) {
        return {
          accessToken: decrypt(user.access_token),
          refreshToken: user.refresh_token ? decrypt(user.refresh_token) : null,
          expiresAt: null,
        }
      }
    } else if (provider === 'vercel') {
      const { data: user } = await supabase
        .from('users')
        .select('access_token, refresh_token')
        .eq('id', userId)
        .eq('provider', 'vercel')
        .limit(1)
        .maybeSingle()

      if (user?.access_token) {
        return {
          accessToken: decrypt(user.access_token),
          refreshToken: user.refresh_token ? decrypt(user.refresh_token) : null,
          expiresAt: null,
        }
      }
    }

    return null
  } catch (error) {
    console.error('Error fetching OAuth token:', error)
    return null
  }
}
