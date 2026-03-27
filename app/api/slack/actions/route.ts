import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRunLogger } from '@/lib/utils/run-logger'
import { killSandbox } from '@/lib/sandbox/sandbox-registry'
import { verifySlackRequest } from '@/lib/slack/verify-request'

export const runtime = 'nodejs'

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

  const params = new URLSearchParams(rawBody)
  const payloadRaw = params.get('payload')
  if (!payloadRaw) {
    return NextResponse.json({ error: 'Missing payload' }, { status: 400 })
  }

  let payload: {
    actions?: { action_id?: string; value?: string }[]
    response_url?: string
  }
  try {
    payload = JSON.parse(payloadRaw) as typeof payload
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const action = payload.actions?.[0]
  if (action?.action_id === 'stop_run' && action.value) {
    const runId = action.value
    const supabase = createAdminClient()
    const logger = createRunLogger(runId)

    const { data: run } = await supabase.from('runs').select('id, status').eq('id', runId).maybeSingle()
    if (run?.status === 'processing') {
      await supabase
        .from('runs')
        .update({
          status: 'stopped',
          error: 'Task was stopped by user',
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId)
      await logger.info('Stop request received from Slack')
      try {
        await killSandbox(runId)
      } catch {
        await logger.error('Failed to kill sandbox during stop')
      }
    }
  }

  return NextResponse.json({ ok: true })
}
