import { type NextRequest } from 'next/server'
import { getRequestSession } from '@/lib/session/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptStoredGitHubCredential } from '@/lib/github/user-github-credential'

export async function GET(req: NextRequest) {
  const session = await getRequestSession(req)

  if (!session?.user) {
    return Response.json({ connected: false })
  }

  if (!session.user.id) {
    console.error('GitHub status check: session.user.id is undefined')
    return Response.json({ connected: false })
  }

  try {
    const supabase = createAdminClient()

    const { data: cred } = await supabase
      .from('user_credentials')
      .select('encrypted_secret')
      .eq('user_id', session.user.id)
      .eq('provider', 'github')
      .maybeSingle()

    if (cred?.encrypted_secret) {
      const parsed = decryptStoredGitHubCredential(cred.encrypted_secret)
      if (parsed?.accessToken) {
        return Response.json({
          connected: true,
          username: parsed.username || undefined,
        })
      }
    }

    const { data: accounts } = await supabase
      .from('accounts')
      .select('username, created_at')
      .eq('user_id', session.user.id)
      .eq('provider', 'github')
      .limit(1)

    if (accounts && accounts.length > 0) {
      return Response.json({
        connected: true,
        username: accounts[0].username,
        connectedAt: accounts[0].created_at,
      })
    }

    // Check if user signed in with GitHub (primary account)
    const { data: users } = await supabase
      .from('users')
      .select('username, created_at')
      .eq('id', session.user.id)
      .eq('provider', 'github')
      .limit(1)

    if (users && users.length > 0) {
      return Response.json({
        connected: true,
        username: users[0].username,
        connectedAt: users[0].created_at,
      })
    }

    return Response.json({ connected: false })
  } catch (error) {
    console.error('Error checking GitHub connection status:', error)
    return Response.json({ connected: false, error: 'Failed to check status' }, { status: 500 })
  }
}
