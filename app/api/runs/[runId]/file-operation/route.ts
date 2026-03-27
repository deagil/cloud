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
    const { operation, sourceFile, targetPath } = body

    if (!operation || !sourceFile) {
      return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 })
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
      return NextResponse.json({ success: false, error: 'Sandbox not found' }, { status: 404 })
    }

    // Determine target directory
    const targetDir = targetPath || '.'
    const sourceBasename = sourceFile.split('/').pop()
    const targetFile = targetPath ? `${targetPath}/${sourceBasename}` : sourceBasename

    if (operation === 'copy') {
      // Copy file
      const copyResult = await sandbox.runCommand({
        cmd: 'cp',
        args: ['-r', sourceFile, targetFile],
        cwd: PROJECT_DIR,
      })

      if (copyResult.exitCode !== 0) {
        const stderr = await copyResult.stderr()
        console.error('Failed to copy file:', stderr)
        return NextResponse.json({ success: false, error: 'Failed to copy file' }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'File copied successfully' })
    } else if (operation === 'cut') {
      // Move file
      const mvResult = await sandbox.runCommand({
        cmd: 'mv',
        args: [sourceFile, targetFile],
        cwd: PROJECT_DIR,
      })

      if (mvResult.exitCode !== 0) {
        const stderr = await mvResult.stderr()
        console.error('Failed to move file:', stderr)
        return NextResponse.json({ success: false, error: 'Failed to move file' }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'File moved successfully' })
    } else {
      return NextResponse.json({ success: false, error: 'Invalid operation' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error performing file operation:', error)
    return NextResponse.json({ success: false, error: 'Failed to perform file operation' }, { status: 500 })
  }
}
