import { ThreadPageClient } from '@/components/thread-page-client'
import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { getMaxSandboxDuration } from '@/lib/db/settings'
import { getThreadBundleForUser } from '@/lib/threads/server'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

interface ThreadPageProps {
  params: Promise<{ threadId: string }>
}

export default async function ThreadPage({ params }: ThreadPageProps) {
  const { threadId } = await params
  const session = await getServerSession()

  if (!session?.user?.id) {
    redirect('/')
  }

  const bundle = await getThreadBundleForUser(threadId, session.user.id)
  if (!bundle) {
    redirect('/')
  }

  const title = (bundle.thread.title as string | null) ?? null
  const stars = await getGitHubStars()
  const maxSandboxDuration = await getMaxSandboxDuration(session.user.id)

  return (
    <ThreadPageClient
      key={threadId}
      threadId={threadId}
      initialTitle={title}
      initialMessages={bundle.messages}
      initialRuns={bundle.runs}
      user={session.user}
      maxSandboxDuration={maxSandboxDuration}
      initialStars={stars}
    />
  )
}

export async function generateMetadata({ params }: ThreadPageProps): Promise<Metadata> {
  const { threadId } = await params
  const session = await getServerSession()
  let pageTitle = `Thread ${threadId.slice(0, 8)}`

  if (session?.user?.id) {
    const bundle = await getThreadBundleForUser(threadId, session.user.id)
    const t = bundle?.thread.title as string | null | undefined
    if (t) pageTitle = t
  }

  return {
    title: `${pageTitle} - Coding Agent Platform`,
    description: 'Thread conversation and runs',
  }
}
