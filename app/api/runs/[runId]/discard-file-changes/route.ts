import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'
import { PROJECT_DIR } from '@/lib/sandbox/commands'

export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { runId } = await params
    const body = await request.json()
    const { filename } = body

    if (!filename) {
      return NextResponse.json({ success: false, error: 'Missing filename parameter' }, { status: 400 })
    }

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
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }

    if (!task.sandbox_id) {
      return NextResponse.json({ success: false, error: 'Sandbox not available' }, { status: 400 })
    }

    // Get sandbox
    const { getSandbox } = await import('@/lib/sandbox/sandbox-registry')
    const { Sandbox } = await import('@vercel/sandbox')

    let sandbox = getSandbox(runId)

    // Try to reconnect if not in registry
    if (!sandbox) {
      const sandboxToken = process.env.SANDBOX_VERCEL_TOKEN
      const teamId = process.env.SANDBOX_VERCEL_TEAM_ID
      const projectId = process.env.SANDBOX_VERCEL_PROJECT_ID

      if (sandboxToken && teamId && projectId) {
        sandbox = await Sandbox.get({
          sandboxId: task.sandbox_id,
          teamId,
          projectId,
          token: sandboxToken,
        })
      }
    }

    if (!sandbox) {
      return NextResponse.json({ success: false, error: 'Sandbox not found or inactive' }, { status: 400 })
    }

    // Check if file is tracked in git
    const lsFilesResult = await sandbox.runCommand({
      cmd: 'git',
      args: ['ls-files', filename],
      cwd: PROJECT_DIR,
    })
    const isTracked = (await lsFilesResult.stdout()).trim().length > 0

    if (isTracked) {
      // File is tracked, use git checkout to revert changes
      const checkoutResult = await sandbox.runCommand({
        cmd: 'git',
        args: ['checkout', 'HEAD', '--', filename],
        cwd: PROJECT_DIR,
      })

      if (checkoutResult.exitCode !== 0) {
        const stderr = await checkoutResult.stderr()
        console.error('Failed to discard changes:', stderr)
        return NextResponse.json({ success: false, error: 'Failed to discard changes' }, { status: 500 })
      }
    } else {
      // File is untracked (new file), delete it
      const rmResult = await sandbox.runCommand({
        cmd: 'rm',
        args: [filename],
        cwd: PROJECT_DIR,
      })

      if (rmResult.exitCode !== 0) {
        const stderr = await rmResult.stderr()
        console.error('Failed to delete file:', stderr)
        return NextResponse.json({ success: false, error: 'Failed to delete file' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      message: isTracked ? 'Changes discarded successfully' : 'New file deleted successfully',
    })
  } catch (error) {
    console.error('Error discarding file changes:', error)

    // Check if it's a 410 error (sandbox not running)
    if (error && typeof error === 'object' && 'status' in error && error.status === 410) {
      return NextResponse.json(
        {
          success: false,
          error: 'Sandbox is not running',
        },
        { status: 410 },
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred while discarding changes',
      },
      { status: 500 },
    )
  }
}
