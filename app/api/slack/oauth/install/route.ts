import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { ensurePersonalWorkspace } from '@/lib/db/profiles'
import { getProfileByUserId } from '@/lib/db/profiles'

export async function GET() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'))
  }

  const clientId = process.env.SLACK_CLIENT_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!clientId || !appUrl) {
    return NextResponse.json({ error: 'Slack OAuth is not configured' }, { status: 503 })
  }

  const profile = await getProfileByUserId(session.user.id)
  const slug = profile?.username || session.user.id.slice(0, 8)
  const workspaceId = await ensurePersonalWorkspace(session.user.id, slug)

  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/slack/oauth/callback`
  const scopes = [
    'app_mentions:read',
    'chat:write',
    'channels:history',
    'channels:read',
    'groups:history',
    'groups:read',
    'im:history',
    'im:read',
    'mpim:history',
    'mpim:read',
  ].join(',')

  const url = new URL('https://slack.com/oauth/v2/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('scope', scopes)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', workspaceId)

  return NextResponse.redirect(url.toString())
}
