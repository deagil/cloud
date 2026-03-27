import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'

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
      .select('*')
      .eq('id', runId)
      .eq('created_by', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }

    // Clear logs by setting to empty array
    await supabase.from('runs').update({ logs: [] }).eq('id', runId)

    return NextResponse.json({
      success: true,
      message: 'Logs cleared successfully',
    })
  } catch (error) {
    console.error('Error clearing logs:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to clear logs' },
      { status: 500 },
    )
  }
}
