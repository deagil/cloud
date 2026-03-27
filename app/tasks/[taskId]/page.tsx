import { TaskPageClient } from '@/components/task-page-client'
import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { getMaxSandboxDuration } from '@/lib/db/settings'
import { Metadata } from 'next'

interface TaskPageProps {
  params: Promise<{
    taskId: string
  }>
}

export default async function TaskPage({ params }: TaskPageProps) {
  const { taskId } = await params
  const session = await getServerSession()

  // Get max sandbox duration for this user (user-specific > global > env var)
  const maxSandboxDuration = await getMaxSandboxDuration(session?.user?.id)

  const stars = await getGitHubStars()

  return (
    <TaskPageClient
      taskId={taskId}
      user={session?.user ?? null}
      authProvider={session?.authProvider ?? null}
      initialStars={stars}
      maxSandboxDuration={maxSandboxDuration}
    />
  )
}

export async function generateMetadata({ params }: TaskPageProps): Promise<Metadata> {
  const { taskId } = await params
  const session = await getServerSession()

  // Try to fetch the task to get its title
  let pageTitle = `Task ${taskId}`

  if (session?.user?.id) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const supabase = createAdminClient()
      const { data: task } = await supabase
        .from('tasks')
        .select('title, prompt')
        .eq('id', taskId)
        .eq('user_id', session.user.id)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()

      if (task) {
        // Use title if available, otherwise use truncated prompt
        if (task.title) {
          pageTitle = task.title
        } else if (task.prompt) {
          // Truncate prompt to 60 characters
          pageTitle = task.prompt.length > 60 ? task.prompt.slice(0, 60) + '...' : task.prompt
        }
      }
    } catch (error) {
      // If fetching fails, fall back to task ID
      console.error('Failed to fetch task for metadata:', error)
    }
  }

  return {
    title: `${pageTitle} - Coding Agent Platform`,
    description: 'View task details and execution logs',
  }
}
