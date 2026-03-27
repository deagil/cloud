import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
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

    if (!task || task.created_by !== session.user.id) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    if (!task.sandbox_id) {
      return NextResponse.json({ error: 'Task does not have an active sandbox' }, { status: 400 })
    }

    let sandbox = getSandbox(runId)
    if (!sandbox) {
      try {
        const sandboxToken = process.env.SANDBOX_VERCEL_TOKEN
        const teamId = process.env.SANDBOX_VERCEL_TEAM_ID
        const projectId = process.env.SANDBOX_VERCEL_PROJECT_ID
        if (!sandboxToken || !teamId || !projectId) {
          return NextResponse.json({ error: 'Sandbox credentials not configured' }, { status: 500 })
        }
        const { Sandbox } = await import('@vercel/sandbox')
        sandbox = await Sandbox.get({ sandboxId: task.sandbox_id, teamId, projectId, token: sandboxToken })
      } catch (error) {
        console.error('Failed to reconnect to sandbox:', error)
        return NextResponse.json({ error: 'Failed to connect to sandbox' }, { status: 500 })
      }
    }

    if (!sandbox) {
      return NextResponse.json({ error: 'Sandbox not available' }, { status: 400 })
    }

    const body = await request.json()
    const { method } = body

    switch (method) {
      case 'textDocument/definition':
        return NextResponse.json({ definitions: [] })
      case 'textDocument/hover':
        return NextResponse.json({ hover: null })
      case 'textDocument/completion':
        return NextResponse.json({ completions: [] })
      default:
        return NextResponse.json({ error: 'Unsupported LSP method' }, { status: 400 })
    }
  } catch (error) {
    console.error('LSP request error:', error)
    return NextResponse.json({ error: 'Failed to process LSP request' }, { status: 500 })
  }
}
