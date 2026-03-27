import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Sandbox } from '@vercel/sandbox'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const supabase = createAdminClient()

    const { data: task } = await supabase
      .from('tasks')
      .select('sandbox_id, sandbox_url')
      .eq('id', taskId)
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!task) {
      return NextResponse.json({ status: 'not_found' })
    }
    if (!task.sandbox_id || !task.sandbox_url) {
      return NextResponse.json({ status: 'not_available', message: 'Sandbox not created yet' })
    }

    try {
      const sandbox = await Sandbox.get({
        teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
        projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
        token: process.env.SANDBOX_VERCEL_TOKEN!,
        sandboxId: task.sandbox_id,
      })

      if (!sandbox) {
        return NextResponse.json({ status: 'stopped', message: 'Sandbox has stopped or expired' })
      }

      try {
        const response = await fetch(task.sandbox_url, { method: 'GET', signal: AbortSignal.timeout(5000) })
        const body = await response.text()
        const contentLength = response.headers.get('content-length')

        if (response.status === 200 && (contentLength === '0' || body.length === 0)) {
          return NextResponse.json({ status: 'starting', message: 'Dev server is starting up' })
        }
        if (response.ok && body.length > 0) {
          return NextResponse.json({ status: 'running', message: 'Sandbox and dev server are running' })
        }
        if (response.status === 410 || response.status === 502) {
          return NextResponse.json({ status: 'stopped', message: 'Sandbox has stopped or expired' })
        }
        if (response.status >= 500) {
          return NextResponse.json({
            status: 'error',
            message: 'Dev server returned an error',
            statusCode: response.status,
          })
        }
        return NextResponse.json({ status: 'starting', message: 'Dev server is initializing' })
      } catch (fetchError) {
        if (fetchError instanceof Error) {
          if (fetchError.name === 'TimeoutError' || fetchError.message.includes('timeout')) {
            return NextResponse.json({ status: 'starting', message: 'Dev server is starting or not responding' })
          }
          return NextResponse.json({ status: 'stopped', message: 'Cannot connect to sandbox' })
        }
        return NextResponse.json({ status: 'starting', message: 'Checking dev server status...' })
      }
    } catch {
      return NextResponse.json({ status: 'stopped', message: 'Sandbox no longer exists' })
    }
  } catch (error) {
    console.error('Error checking sandbox health:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to check sandbox health' })
  }
}
