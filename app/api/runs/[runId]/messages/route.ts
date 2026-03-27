import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { runId } = await context.params
    const supabase = createAdminClient()

    const { data: run } = await supabase
      .from('runs')
      .select('id, thread_id')
      .eq('id', runId)
      .eq('created_by', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!run || !run.thread_id) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    const { data: messages } = await supabase
      .from('thread_messages')
      .select('*')
      .eq('thread_id', run.thread_id)
      .order('created_at', { ascending: true })

    return NextResponse.json({
      success: true,
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        threadId: m.thread_id,
        runId: m.run_id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
      })),
    })
  } catch (error) {
    console.error('Error fetching thread messages:', error)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}
