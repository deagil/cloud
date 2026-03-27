import { randomUUID } from 'crypto'
import { NextRequest, NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { insertTaskSchema } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { getGitHubUser } from '@/lib/github/client'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { getMaxSandboxDuration } from '@/lib/db/settings'
import { ensurePersonalWorkspace } from '@/lib/db/profiles'
import { generateBranchName, createFallbackBranchName } from '@/lib/utils/branch-name-generator'
import { generateTaskTitle, createFallbackTitle } from '@/lib/utils/title-generator'
import { createRunLogger } from '@/lib/utils/run-logger'
import { executeRun } from '@/lib/sandbox/execute-run'
import { resolveApiKeysForUser } from '@/lib/credentials/resolve'
import { isSupportedSandboxAgent } from '@/lib/sandbox/supported-agent'
import { getProfileByUserId } from '@/lib/db/profiles'
import { mapRunRowToTask } from '@/lib/runs/map-run-to-api'

/** Postgres `runs.id` is uuid; optimistic UI may send nanoid — only accept real UUIDs. */
const RUN_PRIMARY_KEY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const { data: userRuns } = await supabase
      .from('runs')
      .select('*')
      .eq('created_by', session.user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    const tasks = (userRuns ?? []).map((row) => mapRunRowToTask(row as unknown as Record<string, unknown>))
    return NextResponse.json({ tasks })
  } catch (error) {
    console.error('Error fetching runs:', error)
    return NextResponse.json({ error: 'Failed to fetch runs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = await checkRateLimit(session.user.id)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `You have reached the daily limit of ${rateLimit.total} messages (tasks + follow-ups). Your limit will reset at ${rateLimit.resetAt.toISOString()}`,
          remaining: rateLimit.remaining,
          total: rateLimit.total,
          resetAt: rateLimit.resetAt.toISOString(),
        },
        { status: 429 },
      )
    }

    const body = await request.json()
    const clientRunId = typeof body.id === 'string' && body.id.trim().length > 0 ? body.id.trim() : null
    const runId = clientRunId && RUN_PRIMARY_KEY_UUID.test(clientRunId) ? clientRunId : randomUUID()

    const validatedData = insertTaskSchema.parse({
      ...body,
      id: runId,
      userId: session.user.id,
      status: 'pending',
      progress: 0,
      logs: [],
    })

    const agent = validatedData.selectedAgent || 'claude'
    if (!isSupportedSandboxAgent(agent)) {
      return NextResponse.json({ error: 'Unsupported agent for Sandbox Agent execution' }, { status: 400 })
    }

    const resolved = await resolveApiKeysForUser(session.user.id, agent)
    if (resolved.error) {
      return NextResponse.json({ error: 'AI API keys required for selected agent' }, { status: 400 })
    }

    const profile = await getProfileByUserId(session.user.id)
    const slug = profile?.username || session.user.id.slice(0, 8)
    const workspaceId = await ensurePersonalWorkspace(session.user.id, slug)

    const supabase = createAdminClient()

    let threadId: string = body.threadId
    if (!threadId || typeof threadId !== 'string') {
      const { data: thread, error: threadErr } = await supabase
        .from('threads')
        .insert({
          workspace_id: workspaceId,
          source: 'web',
          title: validatedData.title ?? null,
          created_by: session.user.id,
        })
        .select('id')
        .single()

      if (threadErr || !thread) {
        console.error('Thread insert failed')
        return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 })
      }
      threadId = thread.id as string
    }

    const { data: newRun, error: insertError } = await supabase
      .from('runs')
      .insert({
        id: runId,
        workspace_id: workspaceId,
        thread_id: threadId,
        created_by: validatedData.userId,
        prompt: validatedData.prompt,
        title: validatedData.title ?? null,
        repo_url: validatedData.repoUrl ?? null,
        selected_agent: agent,
        selected_model: validatedData.selectedModel ?? null,
        install_dependencies: validatedData.installDependencies ?? false,
        max_duration: validatedData.maxDuration,
        keep_alive: validatedData.keepAlive ?? false,
        enable_browser: validatedData.enableBrowser ?? false,
        status: validatedData.status,
        progress: validatedData.progress,
        logs: validatedData.logs ?? [],
      })
      .select()
      .single()

    if (insertError || !newRun) {
      console.error('Run insert failed')
      return NextResponse.json({ error: 'Failed to create run' }, { status: 500 })
    }

    const { error: msgErr } = await supabase.from('thread_messages').insert({
      thread_id: threadId,
      author_user_id: session.user.id,
      role: 'user',
      content: validatedData.prompt,
      run_id: runId,
    })

    if (msgErr) {
      console.error('Thread message insert failed')
    }

    after(async () => {
      try {
        if (!process.env.AI_GATEWAY_API_KEY) {
          console.log('AI_GATEWAY_API_KEY not available, skipping AI branch name generation')
          return
        }

        const logger = createRunLogger(runId)
        await logger.info('Generating AI-powered branch name...')

        let repoName: string | undefined
        try {
          const url = new URL(validatedData.repoUrl || '')
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // ignore
        }

        const aiBranchName = await generateBranchName({
          description: validatedData.prompt,
          repoName,
          context: `${agent} agent run`,
        })

        const sb = createAdminClient()
        await sb
          .from('runs')
          .update({ branch_name: aiBranchName, updated_at: new Date().toISOString() })
          .eq('id', runId)

        await logger.success('Generated AI branch name')
      } catch (error) {
        console.error('Error generating AI branch name:', error)

        const fallbackBranchName = createFallbackBranchName(runId)
        try {
          const sb = createAdminClient()
          await sb
            .from('runs')
            .update({ branch_name: fallbackBranchName, updated_at: new Date().toISOString() })
            .eq('id', runId)

          const logger = createRunLogger(runId)
          await logger.info('Using fallback branch name')
        } catch (dbError) {
          console.error('Error updating run with fallback branch name:', dbError)
        }
      }
    })

    after(async () => {
      try {
        if (!process.env.AI_GATEWAY_API_KEY) {
          console.log('AI_GATEWAY_API_KEY not available, skipping AI title generation')
          return
        }

        let repoName: string | undefined
        try {
          const url = new URL(validatedData.repoUrl || '')
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // ignore
        }

        const aiTitle = await generateTaskTitle({
          prompt: validatedData.prompt,
          repoName,
          context: `${agent} agent run`,
        })

        const sb = createAdminClient()
        await sb.from('runs').update({ title: aiTitle, updated_at: new Date().toISOString() }).eq('id', runId)
      } catch (error) {
        console.error('Error generating AI title:', error)

        const fallbackTitle = createFallbackTitle(validatedData.prompt)
        try {
          const sb = createAdminClient()
          await sb.from('runs').update({ title: fallbackTitle, updated_at: new Date().toISOString() }).eq('id', runId)
        } catch (dbError) {
          console.error('Error updating run with fallback title:', dbError)
        }
      }
    })

    const userGithubToken = await getUserGitHubToken()
    const githubUser = await getGitHubUser()
    const maxSandboxDuration = await getMaxSandboxDuration(session.user.id)

    after(async () => {
      try {
        await executeRun({
          runId,
          threadId,
          workspaceId,
          userId: session.user.id,
          prompt: validatedData.prompt,
          repoUrl: validatedData.repoUrl || '',
          maxDuration: validatedData.maxDuration || maxSandboxDuration,
          selectedAgent: agent,
          selectedModel: validatedData.selectedModel,
          installDependencies: validatedData.installDependencies || false,
          keepAlive: validatedData.keepAlive || false,
          enableBrowser: validatedData.enableBrowser || false,
          apiKeys: resolved.keys,
          githubToken: userGithubToken,
          githubUser,
        })
      } catch (error) {
        console.error('Run processing failed:', error)
      }
    })

    return NextResponse.json({ task: newRun, threadId })
  } catch (error) {
    console.error('Error creating run:', error)
    return NextResponse.json({ error: 'Failed to create run' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    if (!action) {
      return NextResponse.json({ error: 'Action parameter is required' }, { status: 400 })
    }

    const actions = action.split(',').map((a) => a.trim())
    const validActions = ['completed', 'failed', 'stopped']
    const invalidActions = actions.filter((a) => !validActions.includes(a))

    if (invalidActions.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid action(s): ${invalidActions.join(', ')}. Valid actions: ${validActions.join(', ')}`,
        },
        { status: 400 },
      )
    }

    const statuses: string[] = []
    if (actions.includes('completed')) statuses.push('completed')
    if (actions.includes('failed')) statuses.push('error')
    if (actions.includes('stopped')) statuses.push('stopped')

    if (statuses.length === 0) {
      return NextResponse.json({ error: 'No valid actions specified' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: deletedRuns } = await supabase
      .from('runs')
      .delete()
      .eq('created_by', session.user.id)
      .in('status', statuses)
      .select('status')

    const deleted = deletedRuns ?? []

    const actionMessages = []
    if (actions.includes('completed')) {
      const completedCount = deleted.filter((r) => r.status === 'completed').length
      if (completedCount > 0) actionMessages.push(`${completedCount} completed`)
    }
    if (actions.includes('failed')) {
      const failedCount = deleted.filter((r) => r.status === 'error').length
      if (failedCount > 0) actionMessages.push(`${failedCount} failed`)
    }
    if (actions.includes('stopped')) {
      const stoppedCount = deleted.filter((r) => r.status === 'stopped').length
      if (stoppedCount > 0) actionMessages.push(`${stoppedCount} stopped`)
    }

    const message =
      actionMessages.length > 0
        ? `${actionMessages.join(' and ')} run(s) deleted successfully`
        : 'No runs found to delete'

    return NextResponse.json({
      message,
      deletedCount: deleted.length,
    })
  } catch (error) {
    console.error('Error deleting runs:', error)
    return NextResponse.json({ error: 'Failed to delete runs' }, { status: 500 })
  }
}
