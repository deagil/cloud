import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'
import { Sandbox } from '@vercel/sandbox'
import { PROJECT_DIR } from '@/lib/sandbox/commands'

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const body = await request.json()
    const { filename, content } = body

    if (!filename || content === undefined) {
      return NextResponse.json({ error: 'Missing filename or content' }, { status: 400 })
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
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    if (!task.sandbox_id) {
      return NextResponse.json({ error: 'Task does not have an active sandbox' }, { status: 400 })
    }

    let sandbox = getSandbox(taskId)
    if (!sandbox) {
      try {
        const sandboxToken = process.env.SANDBOX_VERCEL_TOKEN
        const teamId = process.env.SANDBOX_VERCEL_TEAM_ID
        const projectId = process.env.SANDBOX_VERCEL_PROJECT_ID
        if (!sandboxToken || !teamId || !projectId) {
          return NextResponse.json({ error: 'Sandbox credentials not configured' }, { status: 500 })
        }
        sandbox = await Sandbox.get({ sandboxId: task.sandbox_id, teamId, projectId, token: sandboxToken })
      } catch (error) {
        console.error('Failed to reconnect to sandbox:', error)
        return NextResponse.json({ error: 'Failed to connect to sandbox' }, { status: 500 })
      }
    }

    if (!sandbox) {
      return NextResponse.json({ error: 'Sandbox not available' }, { status: 400 })
    }

    const escapedFilename = "'" + filename.replace(/'/g, "'\\''") + "'"
    const encodedContent = Buffer.from(content).toString('base64')
    const writeCommand = `echo '${encodedContent}' | base64 -d > ${escapedFilename}`

    const result = await sandbox.runCommand({ cmd: 'sh', args: ['-c', writeCommand], cwd: PROJECT_DIR })
    if (result.exitCode !== 0) {
      return NextResponse.json({ error: 'Failed to write file to sandbox' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'File saved successfully' })
  } catch (error) {
    console.error('Error in save-file API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
