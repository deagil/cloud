import 'server-only'

import { Sandbox } from '@vercel/sandbox'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSandbox } from '@/lib/sandbox/creation'
import { executeCodingAgentSession } from '@/lib/sandbox/agent-client'
import { pushChangesToBranch, shutdownSandbox } from '@/lib/sandbox/git'
import { unregisterSandbox } from '@/lib/sandbox/sandbox-registry'
import { detectPortFromRepo } from '@/lib/sandbox/port-detection'
import { createRunLogger } from '@/lib/utils/run-logger'
import { generateCommitMessage, createFallbackCommitMessage } from '@/lib/utils/commit-message-generator'
import { isRunStopped, waitForBranchNameRun } from '@/lib/runs/helpers'
import { assertSupportedAgent, type SupportedSandboxAgent } from '@/lib/sandbox/supported-agent'
import type { ResolvedApiKeys } from '@/lib/credentials/resolve'
import { notifySlackRunFinished } from '@/lib/slack/notify'

export interface ExecuteRunParams {
  runId: string
  threadId: string
  workspaceId: string
  userId: string
  prompt: string
  repoUrl: string
  maxDuration: number
  selectedAgent: string
  selectedModel?: string
  installDependencies: boolean
  keepAlive: boolean
  enableBrowser: boolean
  apiKeys: ResolvedApiKeys
  githubToken: string | null
  githubUser: { username: string; name: string | null; email: string | null } | null
}

export async function executeRun(params: ExecuteRunParams): Promise<void> {
  const {
    runId,
    threadId,
    workspaceId,
    userId,
    prompt,
    repoUrl,
    maxDuration,
    selectedAgent,
    selectedModel,
    installDependencies,
    keepAlive,
    enableBrowser,
    apiKeys,
    githubToken,
    githubUser,
  } = params

  void workspaceId
  void userId

  let sandbox: Sandbox | null = null
  const logger = createRunLogger(runId)
  const agent = assertSupportedAgent(selectedAgent) as SupportedSandboxAgent

  try {
    await logger.updateStatus('processing', 'Run started')
    await logger.updateProgress(10, 'Initializing run execution')

    if (githubToken) {
      await logger.info('Using authenticated GitHub access')
    }
    await logger.info('API keys configured for selected agent')

    if (await isRunStopped(runId)) {
      await logger.info('Run was stopped before execution began')
      return
    }

    const aiBranchName = await waitForBranchNameRun(runId, 10000)

    if (await isRunStopped(runId)) {
      await logger.info('Run was stopped during branch name wait')
      return
    }

    if (aiBranchName) {
      await logger.info('Using AI-generated branch name')
    } else {
      await logger.info('AI branch name not ready, will use fallback during sandbox creation')
    }

    await logger.updateProgress(15, 'Creating sandbox environment')

    const port = await detectPortFromRepo(repoUrl, githubToken)

    const sandboxResult = await createSandbox(
      {
        runId,
        repoUrl,
        githubToken,
        gitAuthorName: githubUser?.name || githubUser?.username || 'Coding Agent',
        gitAuthorEmail: githubUser?.username ? `${githubUser.username}@users.noreply.github.com` : 'agent@example.com',
        apiKeys,
        timeout: `${maxDuration}m`,
        ports: [port],
        runtime: 'node22',
        resources: { vcpus: 4 },
        taskPrompt: prompt,
        selectedAgent,
        selectedModel,
        installDependencies,
        keepAlive,
        enableBrowser,
        preDeterminedBranchName: aiBranchName || undefined,
        onProgress: async (progress: number, message: string) => {
          await logger.updateProgress(progress, message)
        },
        onCancellationCheck: async () => isRunStopped(runId),
      },
      logger,
    )

    if (!sandboxResult.success) {
      if (sandboxResult.cancelled) {
        await logger.info('Run was cancelled during sandbox creation')
        return
      }
      throw new Error(sandboxResult.error || 'Failed to create sandbox')
    }

    if (await isRunStopped(runId)) {
      await logger.info('Run was stopped during sandbox creation')
      if (sandboxResult.sandbox) {
        try {
          await shutdownSandbox(sandboxResult.sandbox)
        } catch {
          // ignore
        }
      }
      return
    }

    const { sandbox: createdSandbox, domain, branchName } = sandboxResult
    sandbox = createdSandbox || null

    const supabase = createAdminClient()
    await supabase
      .from('runs')
      .update({
        sandbox_id: sandbox?.sandboxId ?? null,
        sandbox_url: domain ?? null,
        updated_at: new Date().toISOString(),
        ...(aiBranchName ? {} : { branch_name: branchName }),
      })
      .eq('id', runId)

    if (await isRunStopped(runId)) {
      await logger.info('Run was stopped before agent execution')
      return
    }

    await logger.updateProgress(50, 'Executing coding agent')

    if (!sandbox) {
      throw new Error('Sandbox is not available for agent execution')
    }

    const sanitizedPrompt = prompt.replace(/`/g, "'").replace(/\$/g, '').replace(/\\/g, '').replace(/^-/gm, ' -')

    const agentResult = await executeCodingAgentSession(sandbox, agent, sanitizedPrompt, logger, {
      runId,
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
        await supabase.from('thread_messages').insert({
          thread_id: threadId,
          author_user_id: null,
          role: 'agent',
          content: agentResult.agentResponse,
          run_id: runId,
        })
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
            description: prompt,
            repoName,
            context: `${selectedAgent} agent run`,
          })
        } else {
          commitMessage = createFallbackCommitMessage(prompt)
        }
      } catch {
        commitMessage = createFallbackCommitMessage(prompt)
      }

      const pushResult = await pushChangesToBranch(sandbox, branchName!, commitMessage, logger)

      if (keepAlive) {
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
      void notifySlackRunFinished(runId, 'completed').catch(() => {})
    } else {
      await logger.error('Agent execution failed')
      throw new Error(agentResult.error || 'Agent execution failed')
    }
  } catch (error) {
    console.error('Error processing run:', error)

    if (sandbox) {
      try {
        if (keepAlive) {
          await logger.info('Sandbox kept alive despite error')
        } else {
          unregisterSandbox(runId)
          const shutdownResult = await shutdownSandbox(sandbox)
          if (shutdownResult.success) {
            await logger.info('Sandbox shutdown completed after error')
          } else {
            await logger.error('Sandbox shutdown failed')
          }
        }
      } catch (shutdownError) {
        console.error('Failed to shutdown sandbox after error:', shutdownError)
        await logger.error('Failed to shutdown sandbox after error')
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    await logger.error('Error occurred during run processing')
    await logger.updateStatus('error', errorMessage)
    void notifySlackRunFinished(runId, 'error').catch(() => {})
  }
}
