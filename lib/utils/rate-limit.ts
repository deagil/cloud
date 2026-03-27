import { createAdminClient } from '@/lib/supabase/admin'
import { getMaxMessagesPerDay } from '@/lib/db/settings'

export async function checkRateLimit(
  userId: string,
): Promise<{ allowed: boolean; remaining: number; total: number; resetAt: Date }> {
  const maxMessagesPerDay = await getMaxMessagesPerDay(userId)

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  const supabase = createAdminClient()

  // Count tasks created by this user today (excluding soft-deleted)
  const { data: tasksToday } = await supabase
    .from('tasks')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', today.toISOString())
    .is('deleted_at', null)

  // Count user messages sent today across all non-deleted tasks
  const taskIds = (tasksToday || []).map((t) => t.id)
  let messageCount = 0
  if (taskIds.length > 0) {
    const { data: messages } = await supabase
      .from('task_messages')
      .select('id')
      .in('task_id', taskIds)
      .eq('role', 'user')
      .gte('created_at', today.toISOString())
    messageCount = messages?.length ?? 0
  }

  const count = (tasksToday?.length ?? 0) + messageCount
  const remaining = Math.max(0, maxMessagesPerDay - count)
  const allowed = count < maxMessagesPerDay

  return { allowed, remaining, total: maxMessagesPerDay, resetAt: tomorrow }
}
