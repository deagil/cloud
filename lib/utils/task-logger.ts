import { createAdminClient } from '@/lib/supabase/admin'
import { createInfoLog, createCommandLog, createErrorLog, createSuccessLog, LogEntry } from './logging'

export class TaskLogger {
  private taskId: string

  constructor(taskId: string) {
    this.taskId = taskId
  }

  async append(type: 'info' | 'command' | 'error' | 'success', message: string): Promise<void> {
    try {
      let logEntry: LogEntry
      switch (type) {
        case 'info':
          logEntry = createInfoLog(message)
          break
        case 'command':
          logEntry = createCommandLog(message)
          break
        case 'error':
          logEntry = createErrorLog(message)
          break
        case 'success':
          logEntry = createSuccessLog(message)
          break
        default:
          logEntry = createInfoLog(message)
      }

      const supabase = createAdminClient()
      const { data: task } = await supabase.from('tasks').select('logs').eq('id', this.taskId).maybeSingle()
      const existingLogs = (task?.logs as LogEntry[]) || []

      await supabase
        .from('tasks')
        .update({ logs: [...existingLogs, logEntry], updated_at: new Date().toISOString() })
        .eq('id', this.taskId)
    } catch {
      // Don't throw - logging failures should not break the main process
    }
  }

  async info(message: string): Promise<void> {
    return this.append('info', message)
  }

  async command(message: string): Promise<void> {
    return this.append('command', message)
  }

  async error(message: string): Promise<void> {
    return this.append('error', message)
  }

  async success(message: string): Promise<void> {
    return this.append('success', message)
  }

  async updateProgress(progress: number, message: string): Promise<void> {
    try {
      const logEntry = createInfoLog(message)
      const supabase = createAdminClient()
      const { data: task } = await supabase.from('tasks').select('logs').eq('id', this.taskId).maybeSingle()
      const existingLogs = (task?.logs as LogEntry[]) || []

      await supabase
        .from('tasks')
        .update({
          progress,
          logs: [...existingLogs, logEntry],
          updated_at: new Date().toISOString(),
        })
        .eq('id', this.taskId)
    } catch {
      // Failed to update progress
    }
  }

  async updateStatus(status: 'pending' | 'processing' | 'completed' | 'error', message?: string): Promise<void> {
    try {
      const supabase = createAdminClient()
      const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() }

      if (message) {
        const logEntry = createInfoLog(message)
        const { data: task } = await supabase.from('tasks').select('logs').eq('id', this.taskId).maybeSingle()
        const existingLogs = (task?.logs as LogEntry[]) || []
        updates.logs = [...existingLogs, logEntry]
      }

      await supabase.from('tasks').update(updates).eq('id', this.taskId)
    } catch {
      // Failed to update status
    }
  }
}

export function createTaskLogger(taskId: string): TaskLogger {
  return new TaskLogger(taskId)
}
