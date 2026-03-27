import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ owner: string; repo: string; pr_number: string }> },
) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { owner, repo, pr_number } = await context.params
    const prNumber = parseInt(pr_number, 10)
    if (isNaN(prNumber)) {
      return NextResponse.json({ error: 'Invalid PR number' }, { status: 400 })
    }

    const repoUrl = `https://github.com/${owner}/${repo}`
    const supabase = createAdminClient()

    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('pr_number', prNumber)
      .eq('repo_url', repoUrl)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    return NextResponse.json({ hasTask: !!existingTask, taskId: existingTask?.id ?? null })
  } catch (error) {
    console.error('Error checking for existing task:', error)
    return NextResponse.json({ error: 'Failed to check for existing task' }, { status: 500 })
  }
}
