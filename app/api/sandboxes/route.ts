import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const { data } = await supabase
      .from('tasks')
      .select(
        'id, prompt, repo_url, branch_name, sandbox_id, sandbox_url, created_at, status, keep_alive, max_duration',
      )
      .eq('user_id', session.user.id)
      .not('sandbox_id', 'is', null)
      .order('created_at', { ascending: true })

    return NextResponse.json({
      sandboxes: (data ?? []).map((t) => ({
        id: t.id,
        taskId: t.id,
        prompt: t.prompt,
        repoUrl: t.repo_url,
        branchName: t.branch_name,
        sandboxId: t.sandbox_id,
        sandboxUrl: t.sandbox_url,
        createdAt: t.created_at,
        status: t.status,
        keepAlive: t.keep_alive,
        maxDuration: t.max_duration,
      })),
    })
  } catch (error) {
    console.error('Error fetching sandboxes:', error)
    return NextResponse.json({ error: 'Failed to fetch sandboxes' }, { status: 500 })
  }
}
