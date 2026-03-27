import 'server-only'

import { decrypt } from '@/lib/crypto'
import type { Connector } from '@/lib/db/schema'

export type ConnectorRow = {
  id: string
  workspace_id: string
  created_by: string | null
  name: string
  type: 'local' | 'remote'
  base_url: string | null
  command: string | null
  env: string | null
  status: 'connected' | 'disconnected'
  created_at: string
}

/**
 * Maps a `connectors` table row to the API/agent `Connector` shape.
 * Optional `oauthClientId` / `oauthClientSecret` may be stored inside encrypted `env` JSON.
 */
export function mapConnectorRowToConnector(row: ConnectorRow, viewerUserId: string): Connector {
  let envForUi: Record<string, string> | null = null
  let oauthClientId: string | null = null
  let oauthClientSecret: string | null = null

  if (row.env) {
    try {
      const raw = JSON.parse(decrypt(row.env)) as Record<string, string>
      const { oauthClientId: ocid, oauthClientSecret: ocs, ...rest } = raw
      oauthClientId = ocid ?? null
      oauthClientSecret = ocs ?? null
      envForUi = Object.keys(rest).length > 0 ? rest : null
    } catch {
      envForUi = null
    }
  }

  const createdAt = new Date(row.created_at)

  return {
    id: row.id,
    userId: row.created_by ?? viewerUserId,
    name: row.name,
    description: null,
    type: row.type,
    baseUrl: row.base_url,
    oauthClientId,
    oauthClientSecret,
    command: row.command,
    env: envForUi,
    status: row.status,
    createdAt,
    updatedAt: createdAt,
  } as Connector
}
