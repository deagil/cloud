import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/types/database'

type ProfileRow = Database['public']['Tables']['profiles']['Row']
type WorkspaceMemberRow = Database['public']['Tables']['workspace_members']['Row']

export interface Profile {
  id: string
  username: string | null
  name: string | null
  email: string | null
  avatarUrl: string | null
  createdAt: string
}

export async function getProfileByUserId(userId: string): Promise<Profile | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error || !data) return null
  const row = data as ProfileRow
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  }
}

export async function upsertProfile(profile: {
  id: string
  username?: string | null
  name?: string | null
  email?: string | null
  avatarUrl?: string | null
}): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('profiles').upsert(
    {
      id: profile.id,
      username: profile.username ?? null,
      name: profile.name ?? null,
      email: profile.email ?? null,
      avatar_url: profile.avatarUrl ?? null,
    },
    { onConflict: 'id' },
  )
}

/**
 * Auto-create a personal workspace for a new user.
 * Slug defaults to github_username; falls back to first 8 chars of user ID.
 */
export async function ensurePersonalWorkspace(userId: string, preferredSlug: string): Promise<string> {
  const supabase = createAdminClient()

  // Check if user already owns a workspace
  const { data: existing } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .limit(1)

  const existingRows = (existing ?? []) as Pick<WorkspaceMemberRow, 'workspace_id'>[]
  if (existingRows.length > 0) {
    return existingRows[0].workspace_id
  }

  // Generate a unique slug (lowercase alphanumeric + hyphens)
  const baseSlug =
    preferredSlug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || userId.slice(0, 8)

  let slug = baseSlug
  for (let attempts = 0; attempts < 5; attempts++) {
    const { data: taken } = await supabase.from('workspaces').select('id').eq('slug', slug).maybeSingle()
    if (!taken) break
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
  }

  const { data: workspace, error } = await supabase
    .from('workspaces')
    .insert({
      name: `${preferredSlug}'s workspace`,
      slug,
      owner_id: userId,
    })
    .select('id')
    .single()

  if (error || !workspace) {
    throw new Error(`Failed to create personal workspace: ${error?.message}`)
  }

  const workspaceId = (workspace as { id: string }).id

  await supabase.from('workspace_members').insert({
    workspace_id: workspaceId,
    user_id: userId,
    role: 'owner',
  })

  return workspaceId
}
