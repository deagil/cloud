'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { SharedHeader } from '@/components/shared-header'
import { useThreadMessages } from '@/lib/hooks/use-thread-messages'
import { useThreadRuns } from '@/lib/hooks/use-thread-runs'
import type { ThreadMessage } from '@/lib/types/thread-message'
import type { Task } from '@/lib/db/schema'
import { toast } from 'sonner'
import { Loader2, ArrowUp, ExternalLink } from 'lucide-react'
import type { Session } from '@/lib/session/types'

interface ThreadPageClientProps {
  threadId: string
  initialTitle: string | null
  initialMessages: ThreadMessage[]
  initialRuns: Task[]
  user: Session['user'] | null
  maxSandboxDuration: number
  initialStars: number
}

export function ThreadPageClient({
  threadId,
  initialTitle,
  initialMessages,
  initialRuns,
  user,
  maxSandboxDuration,
  initialStars,
}: ThreadPageClientProps) {
  const router = useRouter()
  const messages = useThreadMessages(threadId, initialMessages)
  const runs = useThreadRuns(threadId, initialRuns)
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const latestRepoUrl = runs.find((r) => r.repoUrl)?.repoUrl ?? ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      toast.error('Sign in required')
      return
    }
    if (!prompt.trim()) return
    if (!latestRepoUrl) {
      toast.error('No repository on this thread', {
        description: 'Open a run that has a repo, or start a new task from the home page with a repository selected.',
      })
      return
    }

    setSubmitting(true)
    try {
      const selectedAgent = localStorage.getItem('last-selected-agent') || 'claude'
      const modelKey = `last-selected-model-${selectedAgent}`
      const selectedModel = localStorage.getItem(modelKey) || 'claude-sonnet-4-5'

      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          prompt: prompt.trim(),
          repoUrl: latestRepoUrl,
          selectedAgent,
          selectedModel,
          installDependencies: true,
          maxDuration: maxSandboxDuration,
          keepAlive: false,
          enableBrowser: false,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        toast.error(err.message || err.error || 'Failed to start run')
        return
      }

      const data = (await response.json()) as { task?: { id?: string } }
      setPrompt('')
      toast.success('Run started')
      if (data.task?.id) {
        router.push(`/runs/${data.task.id}`)
      }
    } catch {
      toast.error('Failed to start run')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      <div className="p-3 border-b shrink-0">
        <SharedHeader
          leftActions={<span className="text-sm font-medium truncate">{initialTitle || 'Thread'}</span>}
          initialStars={initialStars}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full space-y-4">
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Messages</h2>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <ul className="space-y-2">
              {messages.map((m) => (
                <li key={m.id}>
                  <Card>
                    <CardContent className="py-3 px-4 text-sm">
                      <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                        <span className="font-medium capitalize">{m.role}</span>
                        {m.runId && (
                          <Link href={`/runs/${m.runId}`} className="inline-flex items-center gap-0.5 hover:underline">
                            Run <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Runs</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <ul className="space-y-2">
              {runs.map((r) => (
                <li key={r.id}>
                  <Link href={`/runs/${r.id}`}>
                    <Card className="hover:bg-muted/40 transition-colors">
                      <CardContent className="py-3 px-4 text-sm flex justify-between gap-2">
                        <span className="truncate">{r.title || r.prompt}</span>
                        <span className="text-muted-foreground shrink-0">{r.status}</span>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="border-t p-4 max-w-3xl mx-auto w-full shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={latestRepoUrl ? 'Follow-up instruction…' : 'Select a repo from home to add follow-ups'}
            rows={2}
            className="resize-none min-h-[72px]"
            disabled={!user || !latestRepoUrl || submitting}
          />
          <Button
            type="submit"
            size="icon"
            className="h-10 w-10 shrink-0"
            disabled={!user || !latestRepoUrl || submitting || !prompt.trim()}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  )
}
