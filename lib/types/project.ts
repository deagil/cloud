import type { Database } from './database'

export type ProjectRow = Database['public']['Tables']['projects']['Row']

export interface Project {
  id: string
  workspaceId: string
  name: string
  slug: string
  githubRepoUrl: string | null
  githubOwner: string | null
  githubRepo: string | null
  vercelProjectId: string | null
  baseBranch: string
  sandboxSnapshotId: string | null
  createdBy: string | null
  createdAt: string
}

export function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    slug: row.slug,
    githubRepoUrl: row.github_repo_url,
    githubOwner: row.github_owner,
    githubRepo: row.github_repo,
    vercelProjectId: row.vercel_project_id,
    baseBranch: row.base_branch,
    sandboxSnapshotId: row.sandbox_snapshot_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}
