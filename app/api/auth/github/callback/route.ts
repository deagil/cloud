import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createGitHubSession, saveSession } from '@/lib/session/create-github'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGitHubOAuthClientId } from '@/lib/github/oauth-client-id'
import { safeOAuthReturnPath } from '@/lib/auth/oauth-return-path'
import { encryptGitHubOAuthPayload } from '@/lib/github/user-github-credential'

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const cookieStore = await cookies()

  // Check if this is a sign-in flow or connect flow
  const authMode = cookieStore.get(`github_auth_mode`)?.value ?? null
  const isSignInFlow = authMode === 'signin'

  // Try both cookie patterns (new unified flow vs legacy oauth flow)
  const storedState = cookieStore.get(authMode ? `github_auth_state` : `github_oauth_state`)?.value ?? null
  const storedRedirectTo =
    cookieStore.get(authMode ? `github_auth_redirect_to` : `github_oauth_redirect_to`)?.value ?? null
  const storedUserId = cookieStore.get(`github_oauth_user_id`)?.value ?? null // Required for connect flow

  // For sign-in flow, we don't need storedUserId
  if (isSignInFlow) {
    if (code === null || state === null || storedState !== state || storedRedirectTo === null) {
      return new Response('Invalid OAuth state', {
        status: 400,
      })
    }
  } else {
    // For connect flow (including legacy oauth flow), we need storedUserId
    if (
      code === null ||
      state === null ||
      storedState !== state ||
      storedRedirectTo === null ||
      storedUserId === null
    ) {
      return new Response('Invalid OAuth state', {
        status: 400,
      })
    }
  }

  const clientId = getGitHubOAuthClientId()
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return new Response('GitHub OAuth not configured', {
      status: 500,
    })
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    })

    if (!tokenResponse.ok) {
      console.error('[GitHub Callback] Token exchange failed')
      return new Response('Failed to exchange code for token', { status: 400 })
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string
      scope: string
      token_type: string
      error?: string
      error_description?: string
    }

    if (!tokenData.access_token) {
      console.error('[GitHub Callback] Missing access token in token response')
      return new Response('Failed to authenticate with GitHub', { status: 400 })
    }

    // Fetch GitHub user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    const githubUser = (await userResponse.json()) as {
      login: string
      id: number
    }

    if (isSignInFlow) {
      const session = await createGitHubSession(tokenData.access_token, tokenData.scope)

      if (!session) {
        console.error('[GitHub Callback] Failed to create GitHub session')
        return new Response('Failed to create session', { status: 500 })
      }

      const returnPath = safeOAuthReturnPath(storedRedirectTo)
      const res = NextResponse.redirect(new URL(returnPath, req.nextUrl.origin))

      await saveSession(res, session)

      res.cookies.set('github_auth_state', '', { path: '/', maxAge: 0 })
      res.cookies.set('github_auth_redirect_to', '', { path: '/', maxAge: 0 })
      res.cookies.set('github_auth_mode', '', { path: '/', maxAge: 0 })

      return res
    } else {
      // CONNECT FLOW: Supabase `user_credentials` (legacy Drizzle `accounts` is not in SQL migrations)
      const encryptedSecret = encryptGitHubOAuthPayload({
        accessToken: tokenData.access_token,
        scope: tokenData.scope,
        username: githubUser.login,
        externalUserId: String(githubUser.id),
      })

      const supabase = createAdminClient()
      const { error: persistError } = await supabase.from('user_credentials').upsert(
        {
          user_id: storedUserId!,
          provider: 'github',
          encrypted_secret: encryptedSecret,
        },
        { onConflict: 'user_id,provider' },
      )

      if (persistError) {
        console.error('[GitHub Callback] Failed to persist GitHub credential')
        return NextResponse.redirect(new URL('/?error=github_connect_failed', req.url))
      }

      const returnPath = safeOAuthReturnPath(storedRedirectTo)
      const res = NextResponse.redirect(new URL(returnPath, req.nextUrl.origin))

      res.cookies.set('github_oauth_state', '', { path: '/', maxAge: 0 })
      res.cookies.set('github_oauth_redirect_to', '', { path: '/', maxAge: 0 })
      res.cookies.set('github_oauth_user_id', '', { path: '/', maxAge: 0 })
      if (authMode) {
        res.cookies.set('github_auth_state', '', { path: '/', maxAge: 0 })
        res.cookies.set('github_auth_redirect_to', '', { path: '/', maxAge: 0 })
        res.cookies.set('github_auth_mode', '', { path: '/', maxAge: 0 })
      }

      return res
    }
  } catch (error) {
    console.error('[GitHub Callback] OAuth callback error')
    return new Response('Failed to complete GitHub authentication', { status: 500 })
  }
}
