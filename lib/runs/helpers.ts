import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export async function isRunStopped(runId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('runs').select('status').eq('id', runId).maybeSingle()
  return data?.status === 'stopped'
}

export async function waitForBranchNameRun(runId: string, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  const supabase = createAdminClient()
  while (Date.now() < deadline) {
    const { data } = await supabase.from('runs').select('branch_name').eq('id', runId).maybeSingle()
    if (data?.branch_name) return data.branch_name as string
    await new Promise((r) => setTimeout(r, 400))
  }
  return null
}
