import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { safeOAuthReturnPath } from '@/lib/auth/oauth-return-path'
import { getGitHubOAuthClientId } from '@/lib/github/oauth-client-id'
import { getRequestSession } from '@/lib/session/server'
import { isRelativeUrl } from '@/lib/utils/is-relative-url'
import { generateState } from 'arctic'

function oauthCookieOptions() {
  return {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: 'lax' as const,
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getRequestSession(req)
  if (!session?.user) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  const clientId = getGitHubOAuthClientId()
  const redirectUri = `${req.nextUrl.origin}/api/auth/github/callback`

  if (!clientId) {
    return NextResponse.redirect(new URL('/?error=github_not_configured', req.url))
  }

  const state = generateState()
  const redirectTo = safeOAuthReturnPath(
    isRelativeUrl(req.nextUrl.searchParams.get('next') ?? '/') ? (req.nextUrl.searchParams.get('next') ?? '/') : '/',
  )

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo,read:user,user:email',
    state: state,
  })

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`
  const res = NextResponse.redirect(url)
  const opts = oauthCookieOptions()

  res.cookies.set('github_oauth_redirect_to', redirectTo, opts)
  res.cookies.set('github_oauth_state', state, opts)
  res.cookies.set('github_oauth_user_id', session.user.id, opts)

  return res
}

export async function POST(req: NextRequest): Promise<Response> {
  // Check if user is authenticated with Vercel first
  const session = await getRequestSession(req)
  if (!session?.user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const clientId = getGitHubOAuthClientId()
  const redirectUri = `${req.nextUrl.origin}/api/auth/github/callback`

  if (!clientId) {
    return Response.json({ error: 'GitHub OAuth not configured' }, { status: 500 })
  }

  const state = generateState()
  const store = await cookies()
  const redirectTo = safeOAuthReturnPath(
    isRelativeUrl(req.nextUrl.searchParams.get('next') ?? '/') ? (req.nextUrl.searchParams.get('next') ?? '/') : '/',
  )

  const opts = oauthCookieOptions()
  for (const [key, value] of [
    ['github_oauth_redirect_to', redirectTo],
    ['github_oauth_state', state],
    ['github_oauth_user_id', session.user.id],
  ] as const) {
    store.set(key, value, opts)
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo,read:user,user:email',
    state: state,
  })

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`

  return Response.json({ url })
}
