import { createAdminClient } from '@/lib/supabase/admin'
import { getMaxMessagesPerDay } from '@/lib/db/settings'

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  total: number
  resetAt: Date
  unlimited: boolean
}

export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const maxMessagesPerDay = await getMaxMessagesPerDay(userId)

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  if (maxMessagesPerDay <= 0) {
    return { allowed: true, remaining: 0, total: 0, resetAt: tomorrow, unlimited: true }
  }

  const supabase = createAdminClient()
  const start = today.toISOString()

  const { data: runsToday } = await supabase
    .from('runs')
    .select('id')
    .eq('created_by', userId)
    .gte('created_at', start)
    .is('deleted_at', null)

  const { data: userThreadMessagesToday } = await supabase
    .from('thread_messages')
    .select('id')
    .eq('author_user_id', userId)
    .eq('role', 'user')
    .gte('created_at', start)

  const count = (runsToday?.length ?? 0) + (userThreadMessagesToday?.length ?? 0)
  const remaining = Math.max(0, maxMessagesPerDay - count)
  const allowed = count < maxMessagesPerDay

  return {
    allowed,
    remaining,
    total: maxMessagesPerDay,
    resetAt: tomorrow,
    unlimited: false,
  }
}
