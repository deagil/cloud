import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'
import { getPullRequestStatus } from '@/lib/github/client'

interface RouteParams {
  params: Promise<{ runId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { runId } = await params
    const supabase = createAdminClient()

    const { data: task } = await supabase
      .from('runs')
      .select('repo_url, pr_number')
      .eq('id', runId)
      .eq('created_by', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if (!task.repo_url || !task.pr_number)
      return NextResponse.json({ error: 'Task does not have repository or PR information' }, { status: 400 })

    const result = await getPullRequestStatus({ repoUrl: task.repo_url, prNumber: task.pr_number })
    if (!result.success || !result.status)
      return NextResponse.json({ error: result.error || 'Failed to get PR status' }, { status: 500 })

    const updateData: Record<string, unknown> = {
      pr_status: result.status,
      pr_merge_commit_sha: result.mergeCommitSha || null,
      updated_at: new Date().toISOString(),
    }
    if (result.status === 'merged') updateData.completed_at = new Date().toISOString()

    await supabase.from('runs').update(updateData).eq('id', runId)

    return NextResponse.json({ success: true, data: { status: result.status, mergeCommitSha: result.mergeCommitSha } })
  } catch (error) {
    console.error('Error syncing pull request status:', error)
    return NextResponse.json({ error: 'Failed to sync pull request status' }, { status: 500 })
  }
}
