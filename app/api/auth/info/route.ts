import type { NextRequest } from 'next/server'
import type { Session, SessionUserInfo, Tokens } from '@/lib/session/types'
import { createSession, saveSession } from '@/lib/session/create'
import { saveSession as saveGitHubSession } from '@/lib/session/create-github'
import { getSessionFromReq } from '@/lib/session/server'
import { getOAuthToken } from '@/lib/session/get-oauth-token'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET(req: NextRequest) {
  const existingSession = await getSessionFromReq(req)

  // For GitHub users, just return the existing session without recreating it
  // For Vercel users, recreate the session to refresh user data
  let session: Session | undefined
  let sessionFromJwe = false

  if (existingSession && existingSession.authProvider === 'github') {
    session = existingSession
    sessionFromJwe = true
  } else if (existingSession) {
    // Fetch Vercel token from database to recreate session
    const tokenData = await getOAuthToken(existingSession.user.id, 'vercel')
    if (tokenData) {
      const tokens: Tokens = {
        accessToken: tokenData.accessToken,
        expiresAt: tokenData.expiresAt?.getTime(),
      }
      session = await createSession(tokens)
    } else {
      session = existingSession
    }
    sessionFromJwe = true
  }

  // Supabase-only sessions (e.g. email OTP): no JWE cookie, but Supabase auth cookies exist
  if (!session) {
    session = (await getServerSession()) ?? undefined
  }

  const response = new Response(JSON.stringify(await getData(session)), {
    headers: { 'Content-Type': 'application/json' },
  })

  // Only refresh JWE cookies when the session came from the legacy cookie flow
  if (session && sessionFromJwe) {
    if (session.authProvider === 'github') {
      await saveGitHubSession(response, session)
    } else {
      await saveSession(response, session)
    }
  }

  return response
}

async function getData(session: Session | undefined): Promise<SessionUserInfo> {
  if (!session) {
    return { user: undefined }
  } else {
    return { user: session.user, authProvider: session.authProvider }
  }
}
