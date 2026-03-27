'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Task } from '@/lib/db/schema'

export function useRun(runId: string) {
  const [task, setTask] = useState<Task | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const attemptCountRef = useRef(0)
  const hasFoundTaskRef = useRef(false)
  const pendingSandboxRefetchRef = useRef(false)

  const fetchTask = useCallback(async () => {
    let errorOccurred = false
    try {
      const response = await fetch(`/api/runs/${runId}`)
      if (response.ok) {
        const data = await response.json()
        setTask(data.task)
        setError(null)
        hasFoundTaskRef.current = true
      } else if (response.status === 404) {
        attemptCountRef.current += 1
        if (attemptCountRef.current >= 3 || hasFoundTaskRef.current) {
          setError('Task not found')
          setTask(null)
          errorOccurred = true
        }
      } else {
        setError('Failed to fetch task')
        errorOccurred = true
      }
    } catch (err) {
      console.error('Error fetching task:', err)
      setError('Failed to fetch task')
      errorOccurred = true
    } finally {
      if (hasFoundTaskRef.current || attemptCountRef.current >= 3 || errorOccurred) {
        setIsLoading(false)
      }
    }
  }, [runId])

  useEffect(() => {
    attemptCountRef.current = 0
    hasFoundTaskRef.current = false
    setIsLoading(true)
    setError(null)
    fetchTask()
    const retryInterval = setInterval(() => {
      if (!hasFoundTaskRef.current && attemptCountRef.current < 3) {
        fetchTask()
      } else {
        clearInterval(retryInterval)
      }
    }, 2000)
    return () => clearInterval(retryInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  useEffect(() => {
    if (!runId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`run-updates-${runId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runs', filter: `id=eq.${runId}` }, () => {
        void fetchTask()
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'run_events', filter: `run_id=eq.${runId}` },
        () => {
          void fetchTask()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [runId, fetchTask])

  useEffect(() => {
    if (!task || task.sandboxUrl) {
      pendingSandboxRefetchRef.current = false
      return
    }
    const logs = task.logs || []
    const hasDevServerLog = logs.some(
      (log) => log.message === 'Development server is running' || log.message === 'Development server started',
    )
    if (hasDevServerLog && !pendingSandboxRefetchRef.current) {
      pendingSandboxRefetchRef.current = true
      setTimeout(() => fetchTask(), 500)
    }
  }, [task, fetchTask])

  return { task, isLoading, error, refetch: fetchTask }
}
