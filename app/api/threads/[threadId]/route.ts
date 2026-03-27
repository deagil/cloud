import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getThreadBundleForUser } from '@/lib/threads/server'

interface RouteParams {
  params: Promise<{ threadId: string }>
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { threadId } = await params
    const bundle = await getThreadBundleForUser(threadId, session.user.id)
    if (!bundle) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    return NextResponse.json({
      thread: bundle.thread,
      messages: bundle.messages,
      runs: bundle.runs,
    })
  } catch (error) {
    console.error('Error fetching thread:', error)
    return NextResponse.json({ error: 'Failed to fetch thread' }, { status: 500 })
  }
}
