import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Connector } from '@/lib/db/schema'
import { getWorkspaceIdsForUser } from '@/lib/db/workspace-members'
import { mapConnectorRowToConnector } from '@/lib/connectors/map-row'

/** Loads connected MCP connectors for every workspace the user belongs to (admin client; explicit filter). */
export async function loadConnectedMcpConnectorsForUser(
  userId: string,
  supabase: SupabaseClient,
): Promise<Connector[]> {
  const workspaceIds = await getWorkspaceIdsForUser(userId)
  if (workspaceIds.length === 0) return []

  const { data } = await supabase
    .from('connectors')
    .select('*')
    .in('workspace_id', workspaceIds)
    .eq('status', 'connected')

  return (data ?? []).map((row) => mapConnectorRowToConnector(row, userId))
}
