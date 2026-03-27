import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'
import { getRequestSession } from '@/lib/session/server'
import { decrypt } from '@/lib/crypto'
import { decryptStoredGitHubCredential, parseDecryptedGitHubCredential } from '@/lib/github/user-github-credential'
import type { NextRequest } from 'next/server'

export async function getUserGitHubToken(req?: NextRequest): Promise<string | null> {
  const session = req ? await getRequestSession(req) : await getServerSession()

  if (!session?.user?.id) {
    return null
  }

  try {
    const supabase = createAdminClient()

    const { data: cred } = await supabase
      .from('user_credentials')
      .select('encrypted_secret')
      .eq('user_id', session.user.id)
      .eq('provider', 'github')
      .maybeSingle()

    if (cred?.encrypted_secret) {
      const parsed = decryptStoredGitHubCredential(cred.encrypted_secret)
      if (parsed?.accessToken) return parsed.accessToken
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('access_token')
      .eq('user_id', session.user.id)
      .eq('provider', 'github')
      .limit(1)
      .maybeSingle()

    if (account?.access_token) {
      const plain = decrypt(account.access_token)
      const parsed = parseDecryptedGitHubCredential(plain)
      return parsed?.accessToken ?? plain
    }

    const { data: user } = await supabase
      .from('users')
      .select('access_token')
      .eq('id', session.user.id)
      .eq('provider', 'github')
      .limit(1)
      .maybeSingle()

    if (user?.access_token) {
      const plain = decrypt(user.access_token)
      const parsed = parseDecryptedGitHubCredential(plain)
      return parsed?.accessToken ?? plain
    }

    return null
  } catch (error) {
    console.error('Error fetching user GitHub token:', error)
    return null
  }
}

/** GitHub token for a profile (e.g. workspace owner) without a request session. */
export async function getGitHubTokenForProfileId(profileId: string): Promise<string | null> {
  try {
    const supabase = createAdminClient()

    const { data: cred } = await supabase
      .from('user_credentials')
      .select('encrypted_secret')
      .eq('user_id', profileId)
      .eq('provider', 'github')
      .maybeSingle()

    if (cred?.encrypted_secret) {
      const parsed = decryptStoredGitHubCredential(cred.encrypted_secret)
      if (parsed?.accessToken) return parsed.accessToken
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('access_token')
      .eq('user_id', profileId)
      .eq('provider', 'github')
      .limit(1)
      .maybeSingle()

    if (account?.access_token) {
      const plain = decrypt(account.access_token)
      const parsed = parseDecryptedGitHubCredential(plain)
      return parsed?.accessToken ?? plain
    }

    const { data: user } = await supabase
      .from('users')
      .select('access_token')
      .eq('id', profileId)
      .eq('provider', 'github')
      .limit(1)
      .maybeSingle()

    if (user?.access_token) {
      const plain = decrypt(user.access_token)
      const parsed = parseDecryptedGitHubCredential(plain)
      return parsed?.accessToken ?? plain
    }

    return null
  } catch (error) {
    console.error('Error fetching GitHub token for profile:', error)
    return null
  }
}
