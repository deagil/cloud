import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'

export async function getSlackBotTokenForWorkspace(workspaceId: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('workspace_integrations')
    .select('slack_bot_token')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  const enc = data?.slack_bot_token
  if (!enc) return null
  try {
    return decrypt(enc)
  } catch {
    return null
  }
}
