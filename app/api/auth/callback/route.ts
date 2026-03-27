import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { upsertProfile, ensurePersonalWorkspace } from '@/lib/db/profiles'
import { isRelativeUrl } from '@/lib/utils/is-relative-url'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/'
  const next = isRelativeUrl(rawNext) ? rawNext : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    console.error('[auth/callback] exchangeCodeForSession error:', error)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const user = data.user
  const meta = user.user_metadata ?? {}

  // Upsert profile from GitHub OAuth metadata
  await upsertProfile({
    id: user.id,
    username: meta.user_name ?? meta.preferred_username ?? null,
    name: meta.full_name ?? meta.name ?? null,
    email: user.email ?? null,
    avatarUrl: meta.avatar_url ?? null,
  })

  // Auto-create personal workspace on first sign-in
  const preferredSlug = meta.user_name ?? meta.preferred_username ?? user.id.slice(0, 8)
  await ensurePersonalWorkspace(user.id, preferredSlug)

  return NextResponse.redirect(`${origin}${next}`)
}
