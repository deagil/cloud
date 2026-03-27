import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Sandbox } from '@vercel/sandbox'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'
import { getServerSession } from '@/lib/session/get-server-session'
import { PROJECT_DIR } from '@/lib/sandbox/commands'

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const { command } = await request.json()

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ success: false, error: 'Command is required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: task } = await supabase
      .from('tasks')
      .select('sandbox_id')
      .eq('id', taskId)
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }
    if (!task.sandbox_id) {
      return NextResponse.json({ success: false, error: 'No sandbox found for this task' }, { status: 400 })
    }

    let sandbox = getSandbox(taskId)
    if (!sandbox) {
      try {
        const sandboxToken = process.env.SANDBOX_VERCEL_TOKEN
        const teamId = process.env.SANDBOX_VERCEL_TEAM_ID
        const projectId = process.env.SANDBOX_VERCEL_PROJECT_ID
        if (!sandboxToken || !teamId || !projectId) {
          return NextResponse.json({ success: false, error: 'Sandbox credentials not configured' }, { status: 500 })
        }
        sandbox = await Sandbox.get({ sandboxId: task.sandbox_id, teamId, projectId, token: sandboxToken })
      } catch (error) {
        console.error('Failed to reconnect to sandbox:', error)
        return NextResponse.json({ success: false, error: 'Failed to connect to sandbox' }, { status: 500 })
      }
    }

    if (!sandbox) {
      return NextResponse.json({ success: false, error: 'Sandbox not available' }, { status: 400 })
    }

    try {
      const result = await sandbox.runCommand({ cmd: 'sh', args: ['-c', command], cwd: PROJECT_DIR })
      let stdout = ''
      let stderr = ''
      try {
        stdout = await result.stdout()
      } catch {}
      try {
        stderr = await result.stderr()
      } catch {}
      return NextResponse.json({ success: true, data: { exitCode: result.exitCode, stdout, stderr } })
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Command execution failed' },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('Error in terminal endpoint:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
