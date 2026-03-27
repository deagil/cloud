import { NextRequest, NextResponse, after } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRunLogger } from '@/lib/utils/run-logger'
import { Sandbox } from '@vercel/sandbox'
import { createSandbox } from '@/lib/sandbox/creation'
import { executeCodingAgentSession } from '@/lib/sandbox/agent-client'
import { pushChangesToBranch, shutdownSandbox } from '@/lib/sandbox/git'
import { unregisterSandbox } from '@/lib/sandbox/sandbox-registry'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { getGitHubUser } from '@/lib/github/client'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { getMaxSandboxDuration } from '@/lib/db/settings'
import { generateCommitMessage, createFallbackCommitMessage } from '@/lib/utils/commit-message-generator'
import { detectPortFromRepo } from '@/lib/sandbox/port-detection'
import { isRunStopped } from '@/lib/runs/helpers'
import { assertSupportedAgent } from '@/lib/sandbox/supported-agent'
import { resolveApiKeysForUser } from '@/lib/credentials/resolve'

export async function POST(req: NextRequest, context: { params: Promise<{ runId: string }> }) {
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

    const { runId } = await context.params
    const body = await req.json()
    const { message } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: run } = await supabase
      .from('runs')
      .select('*')
      .eq('id', runId)
      .eq('created_by', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    if (!run.branch_name) {
      return NextResponse.json({ error: 'Run does not have a branch to continue from' }, { status: 400 })
    }

    if (!run.thread_id) {
      return NextResponse.json({ error: 'Run is missing thread' }, { status: 400 })
    }

    const agent = assertSupportedAgent(run.selected_agent || 'claude')
    const resolved = await resolveApiKeysForUser(session.user.id, agent)
    if (resolved.error) {
      return NextResponse.json({ error: 'AI API keys required for selected agent' }, { status: 400 })
    }

    await supabase.from('thread_messages').insert({
      thread_id: run.thread_id,
      author_user_id: session.user.id,
      role: 'user',
      content: message.trim(),
      run_id: runId,
    })

    await supabase
      .from('runs')
      .update({
        status: 'processing',
        progress: 0,
        updated_at: new Date().toISOString(),
        completed_at: null,
      })
      .eq('id', runId)

    const userGithubToken = await getUserGitHubToken()
    const githubUser = await getGitHubUser()
    const maxSandboxDuration = await getMaxSandboxDuration(session.user.id)

    after(async () => {
      await continueRun({
        runId,
        threadId: run.thread_id as string,
        message: message.trim(),
        repoUrl: run.repo_url || '',
        branchName: run.branch_name as string,
        maxDuration: run.max_duration || maxSandboxDuration,
        selectedAgent: agent,
        selectedModel: run.selected_model || undefined,
        installDependencies: run.install_dependencies || false,
        keepAlive: run.keep_alive || false,
        apiKeys: resolved.keys,
        githubToken: userGithubToken,
        githubUser,
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error continuing run:', error)
    return NextResponse.json({ error: 'Failed to continue run' }, { status: 500 })
  }
}

async function continueRun(params: {
  runId: string
  threadId: string
  message: string
  repoUrl: string
  branchName: string
  maxDuration: number
  selectedAgent: ReturnType<typeof assertSupportedAgent>
  selectedModel?: string
  installDependencies: boolean
  keepAlive: boolean
  apiKeys: NonNullable<Awaited<ReturnType<typeof resolveApiKeysForUser>>['keys']>
  githubToken?: string | null
  githubUser?: { username: string; name: string | null; email: string | null } | null
}) {
  const {
    runId,
    threadId,
    message,
    repoUrl,
    branchName,
    maxDuration,
    selectedAgent,
    selectedModel,
    installDependencies,
    keepAlive,
    apiKeys,
    githubToken,
    githubUser,
  } = params

  let sandbox: Sandbox | null = null
  let isResumedSandbox = false
  const logger = createRunLogger(runId)
  const supabase = createAdminClient()

  try {
    await logger.updateStatus('processing', 'Processing follow-up message')
    await logger.updateProgress(10, 'Initializing continuation')

    if (githubToken) {
      await logger.info('Using authenticated GitHub access')
    }

    const { data: currentRun } = await supabase
      .from('runs')
      .select('sandbox_id, keep_alive, agent_session_id')
      .eq('id', runId)
      .limit(1)
      .maybeSingle()

    if (!currentRun) {
      throw new Error('Run not found')
    }

    if (currentRun.sandbox_id && currentRun.keep_alive) {
      try {
        await logger.info('Attempting to reconnect to existing sandbox')
        const reconnectedSandbox = await Sandbox.get({
          sandboxId: currentRun.sandbox_id,
          teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
          projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
          token: process.env.SANDBOX_VERCEL_TOKEN!,
        })
        if (reconnectedSandbox) {
          await logger.info('Successfully reconnected to existing sandbox')
          sandbox = reconnectedSandbox
          isResumedSandbox = true
          await logger.updateProgress(50, 'Executing agent with follow-up message')
        }
      } catch (error) {
        console.error('Failed to reconnect to sandbox:', error)
        await logger.info('Could not reconnect to sandbox, will create new one')
      }
    }

    if (!sandbox) {
      await logger.updateProgress(15, 'Creating sandbox environment')
      const port = await detectPortFromRepo(repoUrl, githubToken)

      const sandboxResult = await createSandbox(
        {
          runId,
          repoUrl,
          githubToken,
          gitAuthorName: githubUser?.name || githubUser?.username || 'Coding Agent',
          gitAuthorEmail: githubUser?.username
            ? `${githubUser.username}@users.noreply.github.com`
            : 'agent@example.com',
          apiKeys,
          timeout: `${maxDuration}m`,
          ports: [port],
          runtime: 'node22',
          resources: { vcpus: 4 },
          taskPrompt: message,
          selectedAgent,
          selectedModel,
          installDependencies,
          preDeterminedBranchName: branchName,
          onProgress: async (progress: number, msg: string) => {
            await logger.updateProgress(progress, msg)
          },
          onCancellationCheck: async () => isRunStopped(runId),
        },
        logger,
      )

      if (!sandboxResult.success) {
        throw new Error(sandboxResult.error || 'Failed to create sandbox')
      }

      const { sandbox: createdSandbox, domain } = sandboxResult
      sandbox = createdSandbox || null

      await supabase
        .from('runs')
        .update({
          sandbox_id: sandbox?.sandboxId || null,
          sandbox_url: domain || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId)
    }

    if (!sandbox) {
      throw new Error('Sandbox is not available for agent execution')
    }

    const { data: previousMessages } = await supabase
      .from('thread_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(20)

    const contextMessages = (previousMessages ?? []).slice(-6, -1)

    const sanitizedPrompt = message.replace(/`/g, "'").replace(/\$/g, '').replace(/\\/g, '').replace(/^-/gm, ' -')

    let promptWithContext = sanitizedPrompt
    if (contextMessages.length > 0 && !isResumedSandbox) {
      let conversationHistory = '\n\n---\n\nFor context, here is the conversation history:\n\n'
      for (const msg of contextMessages) {
        const role = msg.role === 'user' ? 'User' : 'Agent'
        const truncatedContent = msg.content.length > 500 ? `${msg.content.substring(0, 500)}...` : msg.content
        const sanitizedContent = truncatedContent
          .replace(/`/g, "'")
          .replace(/\$/g, '')
          .replace(/\\/g, '')
          .replace(/^-/gm, ' -')
        conversationHistory += `${role}: ${sanitizedContent}\n\n`
      }
      promptWithContext = `${sanitizedPrompt}${conversationHistory}`
    }

    const agentResult = await executeCodingAgentSession(sandbox, selectedAgent, promptWithContext, logger, {
      selectedModel,
    })

    if (agentResult.sessionId) {
      await supabase.from('runs').update({ agent_session_id: agentResult.sessionId }).eq('id', runId)
    }

    if (agentResult.success) {
      await logger.success('Agent execution completed')
      await logger.info('Code changes applied successfully')

      if (agentResult.agentResponse) {
        await logger.info('Agent response received')
        try {
          await supabase.from('thread_messages').insert({
            thread_id: threadId,
            author_user_id: null,
            role: 'agent',
            content: agentResult.agentResponse,
            run_id: runId,
          })
        } catch (error) {
          console.error('Failed to save agent message:', error)
        }
      }

      let commitMessage: string
      try {
        let repoName: string | undefined
        try {
          const url = new URL(repoUrl)
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // ignore
        }

        if (process.env.AI_GATEWAY_API_KEY) {
          commitMessage = await generateCommitMessage({
            description: message,
            repoName,
            context: `${selectedAgent} agent follow-up`,
          })
        } else {
          commitMessage = createFallbackCommitMessage(message)
        }
      } catch {
        commitMessage = createFallbackCommitMessage(message)
      }

      const pushResult = await pushChangesToBranch(sandbox, branchName, commitMessage, logger)

      const { data: latestRun } = await supabase
        .from('runs')
        .select('keep_alive')
        .eq('id', runId)
        .limit(1)
        .maybeSingle()

      if (latestRun?.keep_alive) {
        await logger.info('Sandbox kept alive for follow-up messages')
      } else {
        unregisterSandbox(runId)
        const shutdownResult = await shutdownSandbox(sandbox)
        if (shutdownResult.success) {
          await logger.success('Sandbox shutdown completed')
        } else {
          await logger.error('Sandbox shutdown failed')
        }
      }

      if (pushResult.pushFailed) {
        await logger.updateStatus('error')
        await logger.error('Run failed: Unable to push changes to repository')
        throw new Error('Failed to push changes to repository')
      }

      await logger.updateStatus('completed')
      await logger.updateProgress(100, 'Run completed successfully')
    } else {
      await logger.error('Agent execution failed')
      throw new Error(agentResult.error || 'Agent execution failed')
    }
  } catch (error) {
    console.error('Error continuing run:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    try {
      if (sandbox) {
        const { data: latestRun } = await supabase
          .from('runs')
          .select('keep_alive')
          .eq('id', runId)
          .limit(1)
          .maybeSingle()

        if (latestRun?.keep_alive) {
          await logger.info('Sandbox kept alive despite error')
        } else {
          unregisterSandbox(runId)
          await shutdownSandbox(sandbox)
        }
      }
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError)
    }

    await logger.updateStatus('error')
    await logger.error('Run failed to continue')

    await supabase
      .from('runs')
      .update({
        error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)
  }
}
