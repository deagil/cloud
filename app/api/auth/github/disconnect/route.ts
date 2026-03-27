import { type NextRequest } from 'next/server'
import { getRequestSession } from '@/lib/session/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const session = await getRequestSession(req)

  if (!session?.user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (!session.user.id) {
    console.error('Disconnect GitHub: invalid session')
    return Response.json({ error: 'Invalid session - user ID missing' }, { status: 400 })
  }

  // Can only disconnect if user didn't sign in with GitHub
  if (session.authProvider === 'github') {
    return Response.json({ error: 'Cannot disconnect primary authentication method' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('user_credentials')
      .delete()
      .eq('user_id', session.user.id)
      .eq('provider', 'github')
    if (error) {
      console.error('Disconnect GitHub: delete failed')
      return Response.json({ error: 'Failed to disconnect' }, { status: 500 })
    }
    await supabase.from('accounts').delete().eq('user_id', session.user.id).eq('provider', 'github')
    return Response.json({ success: true })
  } catch {
    console.error('Disconnect GitHub: unexpected error')
    return Response.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}
