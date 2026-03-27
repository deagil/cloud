import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapConnectorRowToConnector } from '@/lib/connectors/map-row'
import { getWorkspaceIdsForUser } from '@/lib/db/workspace-members'
import { getRequestSession } from '@/lib/session/server'

export async function GET(req: NextRequest) {
  try {
    const session = await getRequestSession(req)

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized', data: [] }, { status: 401 })
    }

    const workspaceIds = await getWorkspaceIdsForUser(session.user.id)
    if (workspaceIds.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const supabase = createAdminClient()
    const { data: rows, error } = await supabase.from('connectors').select('*').in('workspace_id', workspaceIds)

    if (error) throw new Error(error.message)

    const decryptedConnectors = (rows ?? []).map((row) => mapConnectorRowToConnector(row, session.user.id))

    return NextResponse.json({ success: true, data: decryptedConnectors })
  } catch (error) {
    console.error('Error fetching connectors:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch connectors', data: [] }, { status: 500 })
  }
}
