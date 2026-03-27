import 'server-only'

import { WebClient } from '@slack/web-api'
import { getSlackBotTokenForWorkspace } from '@/lib/slack/workspace-token'

export async function createSlackWebClientForWorkspace(workspaceId: string): Promise<WebClient | null> {
  const token = await getSlackBotTokenForWorkspace(workspaceId)
  if (!token) return null
  return new WebClient(token)
}
