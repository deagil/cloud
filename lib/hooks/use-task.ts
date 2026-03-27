'use client'

import { useRun } from '@/lib/hooks/use-run'

/** @deprecated Prefer `useRun` — alias kept for existing task/run detail components. */
export function useTask(taskId: string) {
  return useRun(taskId)
}
