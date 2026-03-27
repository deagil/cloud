import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'
import { getOctokit, parseGitHubUrl } from '@/lib/github/client'

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { taskId } = await params
    const supabase = createAdminClient()

    const { data: task } = await supabase
      .from('tasks')
      .select('repo_url, pr_number, id')
      .eq('id', taskId)
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if (!task.repo_url || !task.pr_number)
      return NextResponse.json({ error: 'Task does not have a pull request' }, { status: 400 })

    const octokit = await getOctokit()
    if (!octokit.auth)
      return NextResponse.json(
        { error: 'GitHub authentication required. Please connect your GitHub account.' },
        { status: 401 },
      )

    const parsed = parseGitHubUrl(task.repo_url)
    if (!parsed) return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 })

    const { owner, repo } = parsed

    try {
      await octokit.rest.pulls.update({ owner, repo, pull_number: task.pr_number, state: 'open' })
      await supabase.from('tasks').update({ pr_status: 'open', updated_at: new Date().toISOString() }).eq('id', task.id)
      return NextResponse.json({ success: true, message: 'Pull request reopened successfully' })
    } catch (error: unknown) {
      console.error('Error reopening pull request:', error)
      if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status: number }).status
        if (status === 404) return NextResponse.json({ error: 'Pull request not found' }, { status: 404 })
        if (status === 403)
          return NextResponse.json({ error: 'Permission denied. Check repository access' }, { status: 403 })
      }
      return NextResponse.json({ error: 'Failed to reopen pull request' }, { status: 500 })
    }
  } catch (error) {
    console.error('Error in reopen PR API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
