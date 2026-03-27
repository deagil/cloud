import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'
import { PROJECT_DIR } from '@/lib/sandbox/commands'

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { runId } = await params
    const body = await request.json().catch(() => ({}))
    const { commitMessage } = body

    const supabase = createAdminClient()
    const { data: task } = await supabase
      .from('runs')
      .select('sandbox_id, branch_name')
      .eq('id', runId)
      .eq('created_by', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    if (!task.sandbox_id) return NextResponse.json({ success: false, error: 'Sandbox not available' }, { status: 400 })
    if (!task.branch_name) return NextResponse.json({ success: false, error: 'Branch not available' }, { status: 400 })

    const { getSandbox } = await import('@/lib/sandbox/sandbox-registry')
    const { Sandbox } = await import('@vercel/sandbox')
    let sandbox = getSandbox(runId)
    if (!sandbox) {
      const {
        SANDBOX_VERCEL_TOKEN: token,
        SANDBOX_VERCEL_TEAM_ID: teamId,
        SANDBOX_VERCEL_PROJECT_ID: projectId,
      } = process.env
      if (token && teamId && projectId) {
        sandbox = await Sandbox.get({ sandboxId: task.sandbox_id, teamId, projectId, token })
      }
    }
    if (!sandbox) return NextResponse.json({ success: false, error: 'Sandbox not found or inactive' }, { status: 400 })

    const addResult = await sandbox.runCommand({ cmd: 'git', args: ['add', '.'], cwd: PROJECT_DIR })
    if (addResult.exitCode !== 0)
      return NextResponse.json({ success: false, error: 'Failed to add changes' }, { status: 500 })

    const statusResult = await sandbox.runCommand({ cmd: 'git', args: ['status', '--porcelain'], cwd: PROJECT_DIR })
    if (statusResult.exitCode !== 0)
      return NextResponse.json({ success: false, error: 'Failed to check status' }, { status: 500 })

    const hasChanges = (await statusResult.stdout()).trim().length > 0
    if (!hasChanges)
      return NextResponse.json({ success: true, message: 'No changes to sync', committed: false, pushed: false })

    const commitResult = await sandbox.runCommand({
      cmd: 'git',
      args: ['commit', '-m', commitMessage || 'Sync local changes'],
      cwd: PROJECT_DIR,
    })
    if (commitResult.exitCode !== 0)
      return NextResponse.json({ success: false, error: 'Failed to commit changes' }, { status: 500 })

    const pushResult = await sandbox.runCommand({
      cmd: 'git',
      args: ['push', 'origin', task.branch_name],
      cwd: PROJECT_DIR,
    })
    if (pushResult.exitCode !== 0)
      return NextResponse.json({ success: false, error: 'Failed to push changes' }, { status: 500 })

    return NextResponse.json({ success: true, message: 'Changes synced successfully', committed: true, pushed: true })
  } catch (error) {
    console.error('Error syncing changes:', error)
    if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 410) {
      return NextResponse.json({ success: false, error: 'Sandbox is not running' }, { status: 410 })
    }
    return NextResponse.json({ success: false, error: 'An error occurred while syncing changes' }, { status: 500 })
  }
}
