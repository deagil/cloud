import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { killSandbox } from '@/lib/sandbox/sandbox-registry'
import { getServerSession } from '@/lib/session/get-server-session'

interface RouteParams {
  params: Promise<{
    taskId: string
  }>
}

function mapTask(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    prompt: row.prompt,
    title: row.title,
    repoUrl: row.repo_url,
    selectedAgent: row.selected_agent,
    selectedModel: row.selected_model,
    installDependencies: row.install_dependencies,
    maxDuration: row.max_duration,
    keepAlive: row.keep_alive,
    enableBrowser: row.enable_browser,
    status: row.status,
    progress: row.progress,
    logs: row.logs,
    error: row.error,
    branchName: row.branch_name,
    sandboxId: row.sandbox_id,
    agentSessionId: row.agent_session_id,
    sandboxUrl: row.sandbox_url,
    previewUrl: row.preview_url,
    prUrl: row.pr_url,
    prNumber: row.pr_number,
    prStatus: row.pr_status,
    prMergeCommitSha: row.pr_merge_commit_sha,
    mcpServerIds: row.mcp_server_ids,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at,
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const supabase = createAdminClient()
    const { data: task } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({ task: mapTask(task) })
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

    const { taskId } = await params
    const body = await request.json()
    const supabase = createAdminClient()

    const { data: existingTask } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', session.user.id)
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

      const logger = createTaskLogger(taskId)

      try {
        await logger.info('Stop request received - terminating task execution...')

        const { data: updatedTask } = await supabase
          .from('tasks')
          .update({
            status: 'stopped',
            error: 'Task was stopped by user',
            updated_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          })
          .eq('id', taskId)
          .select()
          .single()

        try {
          const killResult = await killSandbox(taskId)
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

        return NextResponse.json({ message: 'Task stopped successfully', task: mapTask(updatedTask) })
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

    const { taskId } = await params
    const supabase = createAdminClient()

    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('id', taskId)
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taskId)
      .eq('user_id', session.user.id)

    return NextResponse.json({ message: 'Task deleted successfully' })
  } catch (error) {
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
