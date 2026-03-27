import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createSlackWebClientForWorkspace } from '@/lib/slack/client'
import { runCompletedBlocks, runFailedBlocks } from '@/lib/slack/blocks'

export async function notifySlackRunFinished(runId: string, status: 'completed' | 'error'): Promise<void> {
  const supabase = createAdminClient()
  const { data: run } = await supabase
    .from('runs')
    .select('thread_id, pr_url, preview_url')
    .eq('id', runId)
    .maybeSingle()

  if (!run?.thread_id) return

  const { data: thread } = await supabase
    .from('threads')
    .select('slack_channel_id, slack_thread_ts, workspace_id')
    .eq('id', run.thread_id)
    .maybeSingle()

  if (!thread?.slack_channel_id || !thread.slack_thread_ts || !thread.workspace_id) return

  const client = await createSlackWebClientForWorkspace(thread.workspace_id as string)
  if (!client) return
  const channel = thread.slack_channel_id as string
  const threadTs = thread.slack_thread_ts as string

  if (status === 'completed') {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: 'Run completed',
      blocks: runCompletedBlocks({ prUrl: run.pr_url, previewUrl: run.preview_url }),
    })
  } else {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: 'Run failed',
      blocks: runFailedBlocks(),
    })
  }
}
