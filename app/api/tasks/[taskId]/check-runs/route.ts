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
      .select('*')
      .eq('id', taskId)
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }

    // Check if task has a branch
    if (!task.branch_name || !task.repo_url) {
      return NextResponse.json({ success: false, error: 'Task does not have a branch' }, { status: 400 })
    }

    // Extract owner and repo from repo_url
    const repoMatch = task.repo_url.match(/github\.com\/([^\/]+)\/([^\/\.]+)/)
    if (!repoMatch) {
      return NextResponse.json({ success: false, error: 'Invalid repository URL' }, { status: 400 })
    }

    const [, owner, repo] = repoMatch

    // Get GitHub client
    const octokit = await getOctokit()
    if (!octokit.auth) {
      return NextResponse.json({ success: false, error: 'GitHub authentication required' }, { status: 401 })
    }

    // Get the latest commit SHA for the branch
    let branchData
    try {
      branchData = await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: task.branch_name,
      })
    } catch (branchError) {
      if (branchError && typeof branchError === 'object' && 'status' in branchError && branchError.status === 404) {
        return NextResponse.json({
          success: true,
          checkRuns: [],
        })
      }
      throw branchError
    }

    const commitSha = branchData.data.commit.sha

    // Fetch check runs for the commit
    const { data: checkRunsData } = await octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: commitSha,
    })

    return NextResponse.json({
      success: true,
      checkRuns: checkRunsData.check_runs.map((run) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        html_url: run.html_url,
        started_at: run.started_at,
        completed_at: run.completed_at,
      })),
    })
  } catch (error) {
    console.error('Error fetching check runs:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch check runs' }, { status: 500 })
  }
}
