import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRunLogger } from '@/lib/utils/run-logger'
import { logsFromRunEvents } from '@/lib/runs/logs-from-events'
import { mapRunRowToTask } from '@/lib/runs/map-run-to-api'
import { killSandbox } from '@/lib/sandbox/sandbox-registry'
import { getServerSession } from '@/lib/session/get-server-session'

interface RouteParams {
  params: Promise<{
    runId: string
  }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { runId } = await params
    const supabase = createAdminClient()
    const { data: task } = await supabase
      .from('runs')
      .select('*')
      .eq('id', runId)
      .eq('created_by', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const { data: events } = await supabase
      .from('run_events')
      .select('type, payload, created_at')
      .eq('run_id', runId)
      .order('created_at', { ascending: true })

    const eventLogs = logsFromRunEvents(
      (events ?? []).map((e) => ({
        type: e.type,
        payload: (e.payload as Record<string, unknown> | null) ?? null,
        created_at: e.created_at,
      })),
    )
    const storedLogs = Array.isArray(task.logs) ? task.logs : []
    const mergedLogs = [...storedLogs, ...eventLogs]

    return NextResponse.json({ task: mapRunRowToTask({ ...task, logs: mergedLogs }) })
  } catch (error) {
    console.error('Error fetching task:', error)
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { runId } = await params
    const body = await request.json()
    const supabase = createAdminClient()

    const { data: existingTask } = await supabase
      .from('runs')
      .select('*')
      .eq('id', runId)
      .eq('created_by', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (body.action === 'stop') {
      if (existingTask.status !== 'processing') {
        return NextResponse.json({ error: 'Task can only be stopped when it is in progress' }, { status: 400 })
      }

      const logger = createRunLogger(runId)

      try {
        await logger.info('Stop request received - terminating task execution...')

        const { data: updatedTask } = await supabase
          .from('runs')
          .update({
            status: 'stopped',
            error: 'Task was stopped by user',
            updated_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          })
          .eq('id', runId)
          .select()
          .single()

        try {
          const killResult = await killSandbox(runId)
          if (killResult.success) {
            await logger.success('Sandbox killed successfully')
          } else {
            await logger.error('Failed to kill sandbox')
          }
        } catch (killError) {
          console.error('Failed to kill sandbox during stop:', killError)
          await logger.error('Failed to kill sandbox during stop')
        }

        await logger.error('Task execution stopped by user')

        return NextResponse.json({ message: 'Task stopped successfully', task: mapRunRowToTask(updatedTask) })
      } catch (error) {
        console.error('Error stopping task:', error)
        await logger.error('Failed to stop task properly')
        return NextResponse.json({ error: 'Failed to stop task' }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error updating task:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { runId } = await params
    const supabase = createAdminClient()

    const { data: existingTask } = await supabase
      .from('runs')
      .select('id')
      .eq('id', runId)
      .eq('created_by', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    await supabase
      .from('runs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', runId)
      .eq('created_by', session.user.id)

    return NextResponse.json({ message: 'Task deleted successfully' })
  } catch (error) {
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
