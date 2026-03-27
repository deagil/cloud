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
    const { foldername } = body

    if (!foldername || typeof foldername !== 'string') {
      return NextResponse.json({ success: false, error: 'Foldername is required' }, { status: 400 })
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

    // Create the folder using mkdir -p
    const mkdirResult = await sandbox.runCommand({
      cmd: 'mkdir',
      args: ['-p', foldername],
      cwd: PROJECT_DIR,
    })

    if (mkdirResult.exitCode !== 0) {
      const stderr = await mkdirResult.stderr()
      console.error('Failed to create folder:', stderr)
      return NextResponse.json({ success: false, error: 'Failed to create folder' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Folder created successfully',
      foldername,
    })
  } catch (error) {
    console.error('Error creating folder:', error)

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
        error: 'An error occurred while creating the folder',
      },
      { status: 500 },
    )
  }
}
