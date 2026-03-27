import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'
import { decrypt } from '@/lib/crypto'
import { USER_AI_KEY_PROVIDERS, type UserAiKeyProvider } from '@/lib/api-keys/providers'

export async function getUserApiKeys(): Promise<{
  OPENAI_API_KEY: string | undefined
  GEMINI_API_KEY: string | undefined
  CURSOR_API_KEY: string | undefined
  ANTHROPIC_API_KEY: string | undefined
  AI_GATEWAY_API_KEY: string | undefined
}> {
  const session = await getServerSession()

  const apiKeys = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    CURSOR_API_KEY: process.env.CURSOR_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  }

  if (!session?.user?.id) {
    return apiKeys
  }

  try {
    const supabase = createAdminClient()
    const { data: rows } = await supabase
      .from('user_credentials')
      .select('provider, encrypted_secret')
      .eq('user_id', session.user.id)
      .in('provider', [...USER_AI_KEY_PROVIDERS])

    for (const row of rows ?? []) {
      const decryptedValue = decrypt(row.encrypted_secret)
      switch (row.provider as UserAiKeyProvider) {
        case 'openai':
          apiKeys.OPENAI_API_KEY = decryptedValue
          break
        case 'gemini':
          apiKeys.GEMINI_API_KEY = decryptedValue
          break
        case 'cursor':
          apiKeys.CURSOR_API_KEY = decryptedValue
          break
        case 'anthropic':
          apiKeys.ANTHROPIC_API_KEY = decryptedValue
          break
        case 'aigateway':
          apiKeys.AI_GATEWAY_API_KEY = decryptedValue
          break
      }
    }
  } catch {
    console.error('Error fetching user API keys')
  }

  return apiKeys
}

export async function getUserApiKey(provider: UserAiKeyProvider): Promise<string | undefined> {
  const session = await getServerSession()

  const systemKeys: Record<UserAiKeyProvider, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    cursor: process.env.CURSOR_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    aigateway: process.env.AI_GATEWAY_API_KEY,
  }

  if (!session?.user?.id) {
    return systemKeys[provider]
  }

  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('user_credentials')
      .select('encrypted_secret')
      .eq('user_id', session.user.id)
      .eq('provider', provider)
      .maybeSingle()

    if (data?.encrypted_secret) {
      return decrypt(data.encrypted_secret)
    }
  } catch {
    console.error('Error fetching user API key')
  }

  return systemKeys[provider]
}
