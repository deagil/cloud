'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Task } from '@/lib/db/schema'

/** Parent should set `key={threadId}` when `initialRuns` comes from the server. */
export function useThreadRuns(threadId: string, initialRuns: Task[]) {
  const [runs, setRuns] = useState<Task[]>(initialRuns)

  useEffect(() => {
    if (!threadId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`thread-runs-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'runs',
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          void fetch(`/api/threads/${threadId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data?.runs) setRuns(data.runs)
            })
            .catch(() => {
              // ignore
            })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [threadId])

  return runs
}
