import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'
import { createPullRequest } from '@/lib/github/client'

interface RouteParams {
  params: Promise<{ runId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { runId } = await params
    const body = await request.json()
    const { title, body: prBody, baseBranch = 'main' } = body

    if (!title) return NextResponse.json({ error: 'PR title is required' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: task } = await supabase
      .from('runs')
      .select('repo_url, branch_name, pr_url, pr_number')
      .eq('id', runId)
      .eq('created_by', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if (!task.repo_url || !task.branch_name)
      return NextResponse.json({ error: 'Task does not have repository or branch information' }, { status: 400 })

    if (task.pr_url) {
      return NextResponse.json({
        success: true,
        data: { prUrl: task.pr_url, prNumber: task.pr_number, alreadyExists: true },
      })
    }

    const result = await createPullRequest({
      repoUrl: task.repo_url,
      branchName: task.branch_name,
      title,
      body: prBody,
      baseBranch,
    })
    if (!result.success)
      return NextResponse.json({ error: result.error || 'Failed to create pull request' }, { status: 500 })

    await supabase
      .from('runs')
      .update({
        pr_url: result.prUrl,
        pr_number: result.prNumber,
        pr_status: 'open',
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)

    return NextResponse.json({ success: true, data: { prUrl: result.prUrl, prNumber: result.prNumber } })
  } catch (error) {
    console.error('Error creating pull request:', error)
    return NextResponse.json({ error: 'Failed to create pull request' }, { status: 500 })
  }
}
