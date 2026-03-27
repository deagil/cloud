import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'
import { mergePullRequest } from '@/lib/github/client'
import { Sandbox } from '@vercel/sandbox'
import { unregisterSandbox } from '@/lib/sandbox/sandbox-registry'

interface RouteParams {
  params: Promise<{ taskId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { taskId } = await params
    const body = await request.json()
    const { commitTitle, commitMessage, mergeMethod = 'squash' } = body
    const supabase = createAdminClient()

    const { data: task } = await supabase
      .from('tasks')
      .select('repo_url, pr_number, sandbox_id')
      .eq('id', taskId)
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if (!task.repo_url || !task.pr_number)
      return NextResponse.json({ error: 'Task does not have repository or PR information' }, { status: 400 })

    const result = await mergePullRequest({
      repoUrl: task.repo_url,
      prNumber: task.pr_number,
      commitTitle,
      commitMessage,
      mergeMethod,
    })
    if (!result.success)
      return NextResponse.json({ error: result.error || 'Failed to merge pull request' }, { status: 500 })

    if (task.sandbox_id) {
      try {
        const sandbox = await Sandbox.get({
          sandboxId: task.sandbox_id,
          teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
          projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
          token: process.env.SANDBOX_VERCEL_TOKEN!,
        })
        await sandbox.stop()
        unregisterSandbox(taskId)
      } catch (sandboxError) {
        console.error('Error stopping sandbox after merge:', sandboxError)
      }
    }

    await supabase
      .from('tasks')
      .update({
        pr_status: 'merged',
        pr_merge_commit_sha: result.sha || null,
        sandbox_id: null,
        sandbox_url: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)

    return NextResponse.json({
      success: true,
      data: { merged: result.merged, message: result.message, sha: result.sha },
    })
  } catch (error) {
    console.error('Error merging pull request:', error)
    return NextResponse.json({ error: 'Failed to merge pull request' }, { status: 500 })
  }
}
