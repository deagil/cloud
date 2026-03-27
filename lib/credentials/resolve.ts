import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'
import { USER_AI_KEY_PROVIDERS, type UserAiKeyProvider } from '@/lib/api-keys/providers'
import type { SupportedSandboxAgent } from '@/lib/sandbox/supported-agent'

export interface ResolvedApiKeys {
  OPENAI_API_KEY?: string
  GEMINI_API_KEY?: string
  CURSOR_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  AI_GATEWAY_API_KEY?: string
}

async function loadUserApiKeysById(userId: string): Promise<ResolvedApiKeys> {
  const keys: ResolvedApiKeys = {}
  const supabase = createAdminClient()
  const { data: rows } = await supabase
    .from('user_credentials')
    .select('provider, encrypted_secret')
    .eq('user_id', userId)
    .in('provider', [...USER_AI_KEY_PROVIDERS])

  for (const row of rows ?? []) {
    try {
      const decryptedValue = decrypt(row.encrypted_secret)
      switch (row.provider as UserAiKeyProvider) {
        case 'openai':
          keys.OPENAI_API_KEY = decryptedValue
          break
        case 'gemini':
          keys.GEMINI_API_KEY = decryptedValue
          break
        case 'cursor':
          keys.CURSOR_API_KEY = decryptedValue
          break
        case 'anthropic':
          keys.ANTHROPIC_API_KEY = decryptedValue
          break
        case 'aigateway':
          keys.AI_GATEWAY_API_KEY = decryptedValue
          break
      }
    } catch {
      // skip bad row
    }
  }
  return keys
}

/**
 * Resolve LLM/API keys: per-user stored keys first, then process env fallbacks.
 */
export async function resolveApiKeysForUser(
  userId: string,
  agent: SupportedSandboxAgent,
): Promise<{ keys: ResolvedApiKeys; error: null } | { keys: null; error: 'ai_credentials_required' }> {
  const stored = await loadUserApiKeysById(userId)
  const keys: ResolvedApiKeys = { ...stored }

  if (process.env.ANTHROPIC_API_KEY) keys.ANTHROPIC_API_KEY = keys.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY
  if (process.env.OPENAI_API_KEY) keys.OPENAI_API_KEY = keys.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY
  if (process.env.CURSOR_API_KEY) keys.CURSOR_API_KEY = keys.CURSOR_API_KEY ?? process.env.CURSOR_API_KEY
  if (process.env.AI_GATEWAY_API_KEY)
    keys.AI_GATEWAY_API_KEY = keys.AI_GATEWAY_API_KEY ?? process.env.AI_GATEWAY_API_KEY

  const ok = agentKeySatisfied(agent, keys)
  if (!ok) {
    return { keys: null, error: 'ai_credentials_required' }
  }

  return { keys, error: null }
}

function agentKeySatisfied(agent: SupportedSandboxAgent, keys: ResolvedApiKeys): boolean {
  switch (agent) {
    case 'claude':
      return !!(keys.ANTHROPIC_API_KEY || keys.AI_GATEWAY_API_KEY)
    case 'codex':
      return !!(keys.OPENAI_API_KEY || keys.AI_GATEWAY_API_KEY)
    case 'cursor':
      return !!keys.CURSOR_API_KEY
    case 'opencode':
      return !!(keys.ANTHROPIC_API_KEY || keys.OPENAI_API_KEY || keys.AI_GATEWAY_API_KEY)
    default:
      return false
  }
}

/** Workspace-level encrypted credentials (future Phase 5+). */
export async function resolveWorkspaceCredentials(_workspaceId: string): Promise<ResolvedApiKeys> {
  void _workspaceId
  return {}
}
