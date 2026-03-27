import { NextRequest, NextResponse } from 'next/server'
import { verifySlackRequest } from '@/lib/slack/verify-request'
import { queueSlackMentionProcessing } from '@/lib/slack/process-mention'

export const runtime = 'nodejs'

interface SlackEventEnvelope {
  type: string
  challenge?: string
  team_id?: string
  event?: {
    type: string
    subtype?: string
    bot_id?: string
    team?: string
    channel?: string
    thread_ts?: string
    ts?: string
    text?: string
  }
}

export async function POST(request: NextRequest) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET
  if (!signingSecret) {
    return NextResponse.json({ error: 'Slack is not configured' }, { status: 503 })
  }

  const rawBody = await request.text()
  const ok = verifySlackRequest(
    signingSecret,
    rawBody,
    request.headers.get('x-slack-request-timestamp'),
    request.headers.get('x-slack-signature'),
  )
  if (!ok) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: SlackEventEnvelope
  try {
    body = JSON.parse(rawBody) as SlackEventEnvelope
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.type === 'url_verification' && body.challenge) {
    return NextResponse.json({ challenge: body.challenge })
  }

  if (body.type === 'event_callback' && body.event?.type === 'app_mention' && !body.event.bot_id) {
    const teamId = body.team_id || body.event.team
    const channel = body.event.channel
    const threadTs = body.event.thread_ts || body.event.ts
    const text = body.event.text || ''
    if (teamId && channel && threadTs) {
      queueSlackMentionProcessing({
        teamId,
        channel,
        threadTs,
        text,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
