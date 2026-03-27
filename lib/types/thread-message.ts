import type { Database } from './database'

export type ThreadMessageRow = Database['public']['Tables']['thread_messages']['Row']

export type ThreadMessageRole = 'user' | 'agent' | 'system'

export interface ThreadMessage {
  id: string
  threadId: string
  authorUserId: string | null
  role: ThreadMessageRole
  content: string
  runId: string | null
  createdAt: string
}

export function threadMessageFromRow(row: ThreadMessageRow): ThreadMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorUserId: row.author_user_id,
    role: row.role,
    content: row.content,
    runId: row.run_id,
    createdAt: row.created_at,
  }
}
