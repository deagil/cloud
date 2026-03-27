import type { Database } from './database'

export type WorkspaceRow = Database['public']['Tables']['workspaces']['Row']
export type WorkspaceMemberRow = Database['public']['Tables']['workspace_members']['Row']
export type WorkspaceIntegrationRow = Database['public']['Tables']['workspace_integrations']['Row']

export interface Workspace {
  id: string
  name: string
  slug: string
  ownerId: string
  createdAt: string
}

export interface WorkspaceMember {
  workspaceId: string
  userId: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: string
}

export interface WorkspaceIntegration {
  workspaceId: string
  githubAppInstallationId: string | null
  vercelTeamId: string | null
  slackTeamId: string | null
  updatedAt: string
}

export function workspaceFromRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  }
}

export function workspaceMemberFromRow(row: WorkspaceMemberRow): WorkspaceMember {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
  }
}
