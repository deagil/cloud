import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { mapRunRowToTask } from '@/lib/runs/map-run-to-api'
import { threadMessageFromRow } from '@/lib/types/thread-message'
import type { Task } from '@/lib/db/schema'
import type { ThreadMessage } from '@/lib/types/thread-message'

export async function getThreadBundleForUser(
  threadId: string,
  userId: string,
): Promise<{
  thread: Record<string, unknown>
  messages: ThreadMessage[]
  runs: Task[]
} | null> {
  const supabase = createAdminClient()

  const { data: thread } = await supabase.from('threads').select('*').eq('id', threadId).maybeSingle()

  if (!thread?.workspace_id) {
    return null
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', thread.workspace_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!member) {
    return null
  }

  const { data: messages } = await supabase
    .from('thread_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  const { data: runs } = await supabase
    .from('runs')
    .select('*')
    .eq('thread_id', threadId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return {
    thread: thread as unknown as Record<string, unknown>,
    messages: (messages ?? []).map((m) => threadMessageFromRow(m)),
    runs: (runs ?? []).map((r) => mapRunRowToTask(r as unknown as Record<string, unknown>)) as Task[],
  }
}
