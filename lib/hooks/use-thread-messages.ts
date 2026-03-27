'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ThreadMessage } from '@/lib/types/thread-message'
import { threadMessageFromRow } from '@/lib/types/thread-message'
import type { Database } from '@/lib/types/database'

type ThreadMessageRow = Database['public']['Tables']['thread_messages']['Row']

/** Parent should set `key={threadId}` so `initialMessages` seeds correctly when the thread changes. */
export function useThreadMessages(threadId: string, initialMessages: ThreadMessage[]) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages)

  useEffect(() => {
    if (!threadId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`thread-messages-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'thread_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as ThreadMessageRow
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            return [...prev, threadMessageFromRow(row)]
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [threadId])

  return messages
}
