import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'
import { PROJECT_DIR } from '@/lib/sandbox/commands'

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const body = await request.json()
    const { commitMessage } = body

    const supabase = createAdminClient()
    const { data: task } = await supabase
      .from('tasks')
      .select('sandbox_id, branch_name')
      .eq('id', taskId)
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    if (!task.sandbox_id) return NextResponse.json({ success: false, error: 'Sandbox not available' }, { status: 400 })
    if (!task.branch_name) return NextResponse.json({ success: false, error: 'Branch not available' }, { status: 400 })

    const { getSandbox } = await import('@/lib/sandbox/sandbox-registry')
    const { Sandbox } = await import('@vercel/sandbox')
    let sandbox = getSandbox(taskId)
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

    const statusResult = await sandbox.runCommand({ cmd: 'git', args: ['status', '--porcelain'], cwd: PROJECT_DIR })
    if (statusResult.exitCode !== 0)
      return NextResponse.json({ success: false, error: 'Failed to check status' }, { status: 500 })

    const hasChanges = (await statusResult.stdout()).trim().length > 0
    if (hasChanges) {
      await sandbox.runCommand({ cmd: 'git', args: ['add', '.'], cwd: PROJECT_DIR })
      await sandbox.runCommand({
        cmd: 'git',
        args: ['commit', '-m', commitMessage || 'Checkpoint before reset'],
        cwd: PROJECT_DIR,
      })
    }

    const lsRemoteResult = await sandbox.runCommand({
      cmd: 'git',
      args: ['ls-remote', '--heads', 'origin', task.branch_name],
      cwd: PROJECT_DIR,
    })
    let resetTarget = 'HEAD'
    if (lsRemoteResult.exitCode === 0 && (await lsRemoteResult.stdout()).trim().length > 0) {
      await sandbox.runCommand({ cmd: 'git', args: ['fetch', 'origin', task.branch_name], cwd: PROJECT_DIR })
      resetTarget = 'FETCH_HEAD'
    }

    const resetResult = await sandbox.runCommand({
      cmd: 'git',
      args: ['reset', '--hard', resetTarget],
      cwd: PROJECT_DIR,
    })
    if (resetResult.exitCode !== 0)
      return NextResponse.json({ success: false, error: 'Failed to reset changes' }, { status: 500 })

    await sandbox.runCommand({ cmd: 'git', args: ['clean', '-fd'], cwd: PROJECT_DIR })

    return NextResponse.json({
      success: true,
      message: 'Changes reset successfully to match remote branch',
      hadLocalChanges: hasChanges,
    })
  } catch (error) {
    console.error('Error resetting changes:', error)
    if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 410) {
      return NextResponse.json({ success: false, error: 'Sandbox is not running' }, { status: 410 })
    }
    return NextResponse.json({ success: false, error: 'An error occurred while resetting changes' }, { status: 500 })
  }
}
