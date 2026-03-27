import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensurePersonalWorkspace, getProfileByUserId, upsertProfile } from '@/lib/db/profiles'

function slugFromEmailLocalPart(email: string): string {
  const local = email.split('@')[0] ?? ''
  return (
    local
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || ''
  )
}

export async function POST(): Promise<Response> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = user.email ?? ''
  const localSlug = slugFromEmailLocalPart(email)
  const existing = await getProfileByUserId(user.id)

  const username = existing?.username ?? (localSlug.length > 0 ? localSlug : null)
  const name = existing?.name ?? null
  const emailOut = email.length > 0 ? email : (existing?.email ?? null)
  const avatarUrl = existing?.avatarUrl ?? null

  await upsertProfile({
    id: user.id,
    username,
    name,
    email: emailOut,
    avatarUrl,
  })

  const preferredSlug =
    username && username.length > 0 ? username : localSlug.length > 0 ? localSlug : user.id.slice(0, 8)
  await ensurePersonalWorkspace(user.id, preferredSlug)

  return NextResponse.json({ ok: true })
}
