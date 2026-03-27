import type { LogEntry } from '@/lib/utils/logging'

/** Map append-only run_events to legacy LogEntry[] for the task UI. */
export function logsFromRunEvents(
  events: { type: string; payload: Record<string, unknown> | null; created_at: string }[],
): LogEntry[] {
  const out: LogEntry[] = []
  for (const e of events) {
    const payload = e.payload ?? {}
    const message =
      typeof payload.message === 'string'
        ? payload.message
        : e.type === 'progress' && typeof payload.progress === 'number'
          ? String(payload.message ?? 'Progress update')
          : e.type === 'agent_output'
            ? 'Agent activity'
            : e.type

    let type: LogEntry['type'] = 'info'
    if (e.type === 'log.info' || e.type === 'progress' || e.type === 'agent_output' || e.type === 'status_changed') {
      type = 'info'
    } else if (e.type === 'log.error') type = 'error'
    else if (e.type === 'log.command') type = 'command'
    else if (e.type === 'log.success') type = 'success'

    out.push({
      type,
      message,
      timestamp: e.created_at,
    })
  }
  return out
}
