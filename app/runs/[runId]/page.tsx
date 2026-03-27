import { TaskPageClient } from '@/components/task-page-client'
import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { getMaxSandboxDuration } from '@/lib/db/settings'
import { Metadata } from 'next'

interface RunPageProps {
  params: Promise<{
    runId: string
  }>
}

export default async function RunPage({ params }: RunPageProps) {
  const { runId } = await params
  const session = await getServerSession()

  const maxSandboxDuration = await getMaxSandboxDuration(session?.user?.id)

  const stars = await getGitHubStars()

  return (
    <TaskPageClient
      taskId={runId}
      user={session?.user ?? null}
      authProvider={session?.authProvider ?? null}
      initialStars={stars}
      maxSandboxDuration={maxSandboxDuration}
    />
  )
}

export async function generateMetadata({ params }: RunPageProps): Promise<Metadata> {
  const { runId } = await params
  const session = await getServerSession()

  let pageTitle = `Run ${runId.slice(0, 8)}`

  if (session?.user?.id) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const supabase = createAdminClient()
      const { data: run } = await supabase
        .from('runs')
        .select('title, prompt')
        .eq('id', runId)
        .eq('created_by', session.user.id)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()

      if (run) {
        if (run.title) {
          pageTitle = run.title
        } else if (run.prompt) {
          pageTitle = run.prompt.length > 60 ? `${run.prompt.slice(0, 60)}...` : run.prompt
        }
      }
    } catch (error) {
      console.error('Failed to fetch run for metadata:', error)
    }
  }

  return {
    title: `${pageTitle} - Coding Agent Platform`,
    description: 'View run details and execution logs',
  }
}
