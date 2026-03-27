import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'
import { getOctokit } from '@/lib/github/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const supabase = createAdminClient()

    const { data: task } = await supabase
      .from('tasks')
      .select('pr_number, repo_url')
      .eq('id', taskId)
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }
    if (!task.pr_number || !task.repo_url) {
      return NextResponse.json({ success: false, error: 'Task does not have a PR' }, { status: 400 })
    }

    const repoMatch = task.repo_url.match(/github\.com\/([^\/]+)\/([^\/\.]+)/)
    if (!repoMatch) {
      return NextResponse.json({ success: false, error: 'Invalid repository URL' }, { status: 400 })
    }

    const [, owner, repo] = repoMatch
    const octokit = await getOctokit()
    if (!octokit.auth) {
      return NextResponse.json({ success: false, error: 'GitHub authentication required' }, { status: 401 })
    }

    const [issueCommentsResponse, reviewCommentsResponse] = await Promise.all([
      octokit.rest.issues.listComments({ owner, repo, issue_number: task.pr_number }),
      octokit.rest.pulls.listReviewComments({ owner, repo, pull_number: task.pr_number }),
    ])

    const allComments = [
      ...issueCommentsResponse.data.map((c) => ({
        id: c.id,
        user: { login: c.user?.login || 'unknown', avatar_url: c.user?.avatar_url || '' },
        body: c.body || '',
        created_at: c.created_at,
        html_url: c.html_url,
      })),
      ...reviewCommentsResponse.data.map((c) => ({
        id: c.id,
        user: { login: c.user?.login || 'unknown', avatar_url: c.user?.avatar_url || '' },
        body: c.body || '',
        created_at: c.created_at,
        html_url: c.html_url,
      })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    return NextResponse.json({ success: true, comments: allComments })
  } catch (error) {
    console.error('Error fetching PR comments:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch PR comments' }, { status: 500 })
  }
}
