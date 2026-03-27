import { createAdminClient } from '@/lib/supabase/admin'
import { redactSensitiveInfo } from './logging'
import type { RunStatus } from '@/lib/types/run'

/**
 * Append-only event logger for runs.
 *
 * Replaces TaskLogger's read-modify-write JSONB pattern with single inserts
 * into run_events. Each insert triggers Supabase Realtime automatically,
 * so the web UI receives live updates without polling.
 */
export class RunLogger {
  private runId: string

  constructor(runId: string) {
    this.runId = runId
  }

  private async insertEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const supabase = createAdminClient()
      await supabase.from('run_events').insert({ run_id: this.runId, type, payload })
    } catch {
      // Never throw from logger — logging failures must not break execution
    }
  }

  async info(message: string): Promise<void> {
    await this.insertEvent('log.info', { message: redactSensitiveInfo(message) })
  }

  async command(message: string): Promise<void> {
    await this.insertEvent('log.command', { message: redactSensitiveInfo(message) })
  }

  async error(message: string): Promise<void> {
    await this.insertEvent('log.error', { message: redactSensitiveInfo(message) })
  }

  async success(message: string): Promise<void> {
    await this.insertEvent('log.success', { message: redactSensitiveInfo(message) })
  }

  async updateProgress(progress: number, message: string): Promise<void> {
    try {
      const supabase = createAdminClient()
      const now = new Date().toISOString()
      await Promise.all([
        supabase.from('runs').update({ progress, updated_at: now }).eq('id', this.runId),
        supabase.from('run_events').insert({
          run_id: this.runId,
          type: 'progress',
          payload: { progress, message: redactSensitiveInfo(message) },
        }),
      ])
    } catch {
      // Never throw from logger
    }
  }

  async updateStatus(status: RunStatus, message?: string): Promise<void> {
    try {
      const supabase = createAdminClient()
      const now = new Date().toISOString()
      const isTerminal = status === 'completed' || status === 'error' || status === 'stopped'
      const update: Record<string, unknown> = {
        status,
        updated_at: now,
        ...(isTerminal ? { completed_at: now } : {}),
      }

      await Promise.all([
        supabase.from('runs').update(update).eq('id', this.runId),
        supabase.from('run_events').insert({
          run_id: this.runId,
          type: 'status_changed',
          payload: { status, message: message ? redactSensitiveInfo(message) : undefined },
        }),
      ])
    } catch {
      // Never throw from logger
    }
  }
}

export function createRunLogger(runId: string): RunLogger {
  return new RunLogger(runId)
}
