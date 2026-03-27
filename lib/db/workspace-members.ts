import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/** Workspace IDs the user is a member of (for workspace-scoped rows like `connectors`). */
export async function getWorkspaceIdsForUser(userId: string): Promise<string[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', userId)

  if (error || !data?.length) {
    return []
  }

  return data.map((row: { workspace_id: string }) => row.workspace_id)
}
