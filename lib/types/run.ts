import type { Database, Json } from './database'

export type RunRow = Database['public']['Tables']['runs']['Row']
export type RunEventRow = Database['public']['Tables']['run_events']['Row']
export type RunMessageRow = Database['public']['Tables']['run_messages']['Row']
export type ReviewRunRow = Database['public']['Tables']['review_runs']['Row']

export type RunStatus = 'pending' | 'processing' | 'completed' | 'error' | 'stopped'
export type RunIntent = 'build' | 'debug' | 'plan' | 'ask'
export type RunEventType =
  | 'log.info'
  | 'log.error'
  | 'log.command'
  | 'log.success'
  | 'progress'
  | 'status_changed'
  | 'agent_output'
  | 'review_ready'

export interface Run {
  id: string
  threadId: string | null
  projectId: string | null
  workspaceId: string
  createdBy: string | null
  prompt: string
  title: string | null
  status: RunStatus
  intent: RunIntent | null
  selectedAgent: string
  selectedModel: string | null
  sandboxId: string | null
  sandboxUrl: string | null
  agentSessionId: string | null
  branchName: string | null
  prUrl: string | null
  prNumber: number | null
  prStatus: 'open' | 'closed' | 'merged' | null
  prMergeCommitSha: string | null
  progress: number
  error: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  deletedAt: string | null
}

export interface RunEvent {
  id: string
  runId: string
  type: RunEventType | string
  payload: Json | null
  createdAt: string
}

export interface RunMessage {
  id: string
  runId: string
  role: 'user' | 'agent'
  content: string
  createdAt: string
}

export interface ReviewRun {
  id: string
  runId: string
  branch: string | null
  previewUrl: string | null
  summary: string | null
  screenshotUrls: string[]
  checkResults: Json | null
  reviewStatus: 'pending' | 'approved' | 'rejected'
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

export function runFromRow(row: RunRow): Run {
  return {
    id: row.id,
    threadId: row.thread_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    prompt: row.prompt,
    title: row.title,
    status: row.status,
    intent: row.intent,
    selectedAgent: row.selected_agent,
    selectedModel: row.selected_model,
    sandboxId: row.sandbox_id,
    sandboxUrl: row.sandbox_url,
    agentSessionId: row.agent_session_id,
    branchName: row.branch_name,
    prUrl: row.pr_url,
    prNumber: row.pr_number,
    prStatus: row.pr_status,
    prMergeCommitSha: row.pr_merge_commit_sha,
    progress: row.progress,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at,
  }
}

export function runEventFromRow(row: RunEventRow): RunEvent {
  return {
    id: row.id,
    runId: row.run_id,
    type: row.type as RunEventType,
    payload: row.payload,
    createdAt: row.created_at,
  }
}

export function runMessageFromRow(row: RunMessageRow): RunMessage {
  return {
    id: row.id,
    runId: row.run_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }
}

export function reviewRunFromRow(row: ReviewRunRow): ReviewRun {
  return {
    id: row.id,
    runId: row.run_id,
    branch: row.branch,
    previewUrl: row.preview_url,
    summary: row.summary,
    screenshotUrls: Array.isArray(row.screenshot_urls) ? (row.screenshot_urls as string[]) : [],
    checkResults: row.check_results,
    reviewStatus: row.review_status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  }
}
