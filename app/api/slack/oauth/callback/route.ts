import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerSession } from '@/lib/session/get-server-session'
import { encrypt } from '@/lib/crypto'

export async function GET(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!clientId || !clientSecret || !appUrl) {
    return NextResponse.json({ error: 'Slack OAuth is not configured' }, { status: 503 })
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const err = url.searchParams.get('error')

  if (err || !code || !state) {
    return NextResponse.redirect(new URL('/?slack_error=1', appUrl))
  }

  const supabase = createAdminClient()
  const { data: member } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', state)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!member) {
    return NextResponse.redirect(new URL('/?slack_forbidden=1', appUrl))
  }

  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/slack/oauth/callback`
  const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })

  const tokenJson = (await tokenRes.json()) as {
    ok?: boolean
    access_token?: string
    team?: { id?: string }
    error?: string
  }

  if (!tokenJson.ok || !tokenJson.access_token || !tokenJson.team?.id) {
    return NextResponse.redirect(new URL('/?slack_token_error=1', appUrl))
  }

  const teamId = tokenJson.team.id
  const encryptedToken = encrypt(tokenJson.access_token)

  const signingSecret = process.env.SLACK_SIGNING_SECRET
  const encryptedSigning = signingSecret ? encrypt(signingSecret) : null

  await supabase.from('workspace_integrations').upsert(
    {
      workspace_id: state,
      slack_team_id: teamId,
      slack_bot_token: encryptedToken,
      ...(encryptedSigning ? { slack_signing_secret: encryptedSigning } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id' },
  )

  await supabase
    .from('slack_workspace_mappings')
    .upsert({ slack_team_id: teamId, workspace_id: state }, { onConflict: 'slack_team_id' })

  return NextResponse.redirect(new URL('/?slack_connected=1', appUrl))
}
