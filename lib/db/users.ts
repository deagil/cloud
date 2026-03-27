import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { type InsertUser } from './schema'
import { nanoid } from 'nanoid'

export async function upsertUser(
  userData: Omit<InsertUser, 'id' | 'createdAt' | 'updatedAt' | 'lastLoginAt'>,
): Promise<string> {
  const { provider, externalId, accessToken, refreshToken, scope } = userData
  const supabase = createAdminClient()

  // First check: Does this exact provider + externalId combination exist as a primary account?
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('provider', provider)
    .eq('external_id', externalId)
    .limit(1)
    .maybeSingle()

  if (existingUser) {
    await supabase
      .from('users')
      .update({
        access_token: accessToken,
        refresh_token: refreshToken ?? null,
        scope: scope ?? null,
        username: userData.username,
        email: userData.email ?? null,
        name: userData.name ?? null,
        avatar_url: userData.avatarUrl ?? null,
        updated_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
      })
      .eq('id', existingUser.id)

    return existingUser.id
  }

  // Second check: Is this a GitHub account already connected to an existing user via accounts table?
  if (provider === 'github') {
    const { data: existingAccount } = await supabase
      .from('accounts')
      .select('user_id')
      .eq('provider', 'github')
      .eq('external_user_id', externalId)
      .limit(1)
      .maybeSingle()

    if (existingAccount) {
      console.log(
        `[upsertUser] GitHub account (${externalId}) is already connected to user ${existingAccount.user_id}. Using existing user.`,
      )

      await supabase
        .from('users')
        .update({
          updated_at: new Date().toISOString(),
          last_login_at: new Date().toISOString(),
        })
        .eq('id', existingAccount.user_id)

      return existingAccount.user_id
    }
  }

  // User doesn't exist at all - create new
  const userId = nanoid()
  const now = new Date().toISOString()

  await supabase.from('users').insert({
    id: userId,
    provider,
    external_id: externalId,
    access_token: accessToken,
    refresh_token: refreshToken ?? null,
    scope: scope ?? null,
    username: userData.username,
    email: userData.email ?? null,
    name: userData.name ?? null,
    avatar_url: userData.avatarUrl ?? null,
    created_at: now,
    updated_at: now,
    last_login_at: now,
  })

  return userId
}

export async function getUserById(userId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('users').select('*').eq('id', userId).limit(1).maybeSingle()
  return data || null
}

export async function getUserByExternalId(provider: 'github' | 'vercel', externalId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('provider', provider)
    .eq('external_id', externalId)
    .limit(1)
    .maybeSingle()
  return data || null
}

export async function getUserByGitHubConnection(githubExternalId: string) {
  const supabase = createAdminClient()
  const { data: account } = await supabase
    .from('accounts')
    .select('user_id')
    .eq('provider', 'github')
    .eq('external_user_id', githubExternalId)
    .limit(1)
    .maybeSingle()

  if (!account) return null

  const { data: user } = await supabase.from('users').select('*').eq('id', account.user_id).maybeSingle()
  return user || null
}
