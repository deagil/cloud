import 'server-only'

import { randomUUID } from 'crypto'
import { after } from 'next/server'
import { WebClient } from '@slack/web-api'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveApiKeysForUser } from '@/lib/credentials/resolve'
import { executeRun } from '@/lib/sandbox/execute-run'
import { getGitHubTokenForProfileId } from '@/lib/github/user-token'
import { getGitHubUserForToken } from '@/lib/github/client'
import { getMaxSandboxDuration } from '@/lib/db/settings'
import { getSlackBotTokenForWorkspace } from '@/lib/slack/workspace-token'
import { runProgressBlocks } from '@/lib/slack/blocks'
import { isSupportedSandboxAgent } from '@/lib/sandbox/supported-agent'

interface SlackMentionPayload {
  teamId: string
  channel: string
  threadTs: string
  text: string
}

/** Ack the Events API quickly; heavy work runs in `after`. */
export function queueSlackMentionProcessing(payload: SlackMentionPayload): void {
  after(() => {
    void processSlackMention(payload).catch(() => {
      console.error('Slack mention processing failed')
    })
  })
}

async function processSlackMention(payload: SlackMentionPayload): Promise<void> {
  const supabase = createAdminClient()
  const { data: mapping } = await supabase
    .from('slack_workspace_mappings')
    .select('workspace_id')
    .eq('slack_team_id', payload.teamId)
    .maybeSingle()

  if (!mapping?.workspace_id) {
    return
  }

  const workspaceId = mapping.workspace_id as string
  const token = await getSlackBotTokenForWorkspace(workspaceId)
  if (!token) {
    return
  }

  const client = new WebClient(token)

  const repoUrl = process.env.SLACK_DEFAULT_REPO_URL?.trim() ?? ''
  if (!repoUrl) {
    await client.chat.postMessage({
      channel: payload.channel,
      thread_ts: payload.threadTs,
      text: 'Repository is not configured. Set SLACK_DEFAULT_REPO_URL on the server.',
    })
    return
  }

  const { data: workspace } = await supabase.from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle()
  const ownerId = workspace?.owner_id as string | undefined
  if (!ownerId) {
    return
  }

  const { data: existingThread } = await supabase
    .from('threads')
    .select('id')
    .eq('slack_channel_id', payload.channel)
    .eq('slack_thread_ts', payload.threadTs)
    .maybeSingle()

  let threadId: string
  if (existingThread?.id) {
    threadId = existingThread.id as string
  } else {
    const { data: inserted, error } = await supabase
      .from('threads')
      .insert({
        workspace_id: workspaceId,
        source: 'slack',
        slack_channel_id: payload.channel,
        slack_thread_ts: payload.threadTs,
        slack_team_id: payload.teamId,
        created_by: ownerId,
        title: null,
      })
      .select('id')
      .single()

    if (error || !inserted?.id) {
      await client.chat.postMessage({
        channel: payload.channel,
        thread_ts: payload.threadTs,
        text: 'Could not start a thread for this workspace.',
      })
      return
    }
    threadId = inserted.id as string
  }

  const prompt = payload.text.replace(/<@[^>]+>/g, '').trim() || 'Help with this thread'
  const runId = randomUUID()
  const selectedAgent = 'claude'

  if (!isSupportedSandboxAgent(selectedAgent)) {
    return
  }

  const resolved = await resolveApiKeysForUser(ownerId, selectedAgent)
  if (resolved.error) {
    await client.chat.postMessage({
      channel: payload.channel,
      thread_ts: payload.threadTs,
      text: 'AI API keys are not configured for this workspace owner.',
    })
    return
  }

  const githubToken = await getGitHubTokenForProfileId(ownerId)
  const githubUser = await getGitHubUserForToken(githubToken)
  const maxSandboxDuration = await getMaxSandboxDuration(ownerId)

  const { error: runErr } = await supabase.from('runs').insert({
    id: runId,
    workspace_id: workspaceId,
    thread_id: threadId,
    created_by: ownerId,
    prompt,
    title: null,
    repo_url: repoUrl,
    selected_agent: selectedAgent,
    selected_model: 'claude-sonnet-4-5',
    install_dependencies: true,
    max_duration: maxSandboxDuration,
    keep_alive: false,
    enable_browser: false,
    status: 'pending',
    progress: 0,
    logs: [],
  })

  if (runErr) {
    await client.chat.postMessage({
      channel: payload.channel,
      thread_ts: payload.threadTs,
      text: 'Could not create a run.',
    })
    return
  }

  await supabase.from('thread_messages').insert({
    thread_id: threadId,
    author_user_id: null,
    role: 'user',
    content: prompt,
    run_id: runId,
  })

  await client.chat.postMessage({
    channel: payload.channel,
    thread_ts: payload.threadTs,
    text: 'Run started',
    blocks: runProgressBlocks(runId),
  })

  try {
    await executeRun({
      runId,
      threadId,
      workspaceId,
      userId: ownerId,
      prompt,
      repoUrl,
      maxDuration: maxSandboxDuration,
      selectedAgent,
      selectedModel: 'claude-sonnet-4-5',
      installDependencies: true,
      keepAlive: false,
      enableBrowser: false,
      apiKeys: resolved.keys,
      githubToken,
      githubUser,
    })
  } catch (error) {
    console.error('Slack-triggered executeRun failed:', error)
  }
}
