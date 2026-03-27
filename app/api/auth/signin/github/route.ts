import { type NextRequest, NextResponse } from 'next/server'
import { generateState } from 'arctic'
import { safeOAuthReturnPath } from '@/lib/auth/oauth-return-path'
import { getGitHubOAuthClientId } from '@/lib/github/oauth-client-id'
import { isRelativeUrl } from '@/lib/utils/is-relative-url'
import { getRequestSession } from '@/lib/session/server'

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

  const clientId = getGitHubOAuthClientId()
  const redirectUri = `${req.nextUrl.origin}/api/auth/github/callback`

  if (!clientId) {
    return NextResponse.redirect(new URL('/?error=github_not_configured', req.url))
  }

  const state = generateState()
  let redirectTo = safeOAuthReturnPath(
    isRelativeUrl(req.nextUrl.searchParams.get('next') ?? '/') ? (req.nextUrl.searchParams.get('next') ?? '/') : '/',
  )

  const isSignInFlow = !session?.user
  const authMode = isSignInFlow ? 'signin' : 'connect'

  if (!isSignInFlow) {
    const redirectUrl = new URL(redirectTo, req.nextUrl.origin)
    redirectUrl.searchParams.set('github_connected', 'true')
    redirectTo = redirectUrl.pathname + redirectUrl.search
  }

  const cookiesToSet: [string, string][] = [
    ['github_auth_redirect_to', redirectTo],
    ['github_auth_state', state],
    ['github_auth_mode', authMode],
  ]

  if (!isSignInFlow && session?.user?.id) {
    cookiesToSet.push(['github_oauth_user_id', session.user.id])
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo,read:user,user:email',
    state: state,
  })

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`
  const res = NextResponse.redirect(url)
  const opts = oauthCookieOptions()

  for (const [key, value] of cookiesToSet) {
    res.cookies.set(key, value, opts)
  }

  return res
}
