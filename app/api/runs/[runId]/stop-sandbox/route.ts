import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Sandbox } from '@vercel/sandbox'
import { getServerSession } from '@/lib/session/get-server-session'
import { unregisterSandbox } from '@/lib/sandbox/sandbox-registry'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { runId } = await params
    const supabase = createAdminClient()

    const { data: task } = await supabase
      .from('runs')
      .select('sandbox_id, created_by')
      .eq('id', runId)
      .limit(1)
      .maybeSingle()

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    if (task.created_by !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    if (!task.sandbox_id) {
      return NextResponse.json({ error: 'Sandbox is not active' }, { status: 400 })
    }

    const sandbox = await Sandbox.get({
      sandboxId: task.sandbox_id,
      teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
      projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
      token: process.env.SANDBOX_VERCEL_TOKEN!,
    })

    await sandbox.stop()
    unregisterSandbox(runId)

    await supabase
      .from('runs')
      .update({ sandbox_id: null, sandbox_url: null, updated_at: new Date().toISOString() })
      .eq('id', runId)

    return NextResponse.json({ success: true, message: 'Sandbox stopped successfully' })
  } catch (error) {
    console.error('Error stopping sandbox:', error)
    return NextResponse.json(
      { error: 'Failed to stop sandbox', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
