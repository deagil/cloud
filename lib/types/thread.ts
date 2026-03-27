import type { Database } from './database'

export type ThreadRow = Database['public']['Tables']['threads']['Row']

export interface Thread {
  id: string
  projectId: string | null
  workspaceId: string
  title: string | null
  source: 'slack' | 'web'
  slackChannelId: string | null
  slackThreadTs: string | null
  slackTeamId: string | null
  createdBy: string | null
  createdAt: string
}

export function threadFromRow(row: ThreadRow): Thread {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    title: row.title,
    source: row.source,
    slackChannelId: row.slack_channel_id,
    slackThreadTs: row.slack_thread_ts,
    slackTeamId: row.slack_team_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}
