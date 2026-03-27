import { NextRequest, NextResponse } from 'next/server'
import { getRequestSession } from '@/lib/session/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/crypto'
import { USER_AI_KEY_PROVIDERS, type UserAiKeyProvider } from '@/lib/api-keys/providers'

export async function GET(req: NextRequest) {
  try {
    const session = await getRequestSession(req)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const { data: rows, error } = await supabase
      .from('user_credentials')
      .select('provider')
      .eq('user_id', session.user.id)
      .in('provider', [...USER_AI_KEY_PROVIDERS])

    if (error) {
      console.error('Error fetching API keys')
      return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      apiKeys: (rows ?? []).map((k) => ({
        provider: k.provider as UserAiKeyProvider,
        createdAt: null as string | null,
      })),
    })
  } catch {
    console.error('Error fetching API keys')
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getRequestSession(req)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { provider, apiKey } = body as { provider: UserAiKeyProvider; apiKey: string }

    if (!provider || !apiKey) {
      return NextResponse.json({ error: 'Provider and API key are required' }, { status: 400 })
    }

    if (!USER_AI_KEY_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase.from('user_credentials').upsert(
      {
        user_id: session.user.id,
        provider,
        encrypted_secret: encrypt(apiKey),
      },
      { onConflict: 'user_id,provider' },
    )

    if (error) {
      console.error('Error saving API key')
      return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    console.error('Error saving API key')
    return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getRequestSession(req)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const provider = searchParams.get('provider')

    if (!provider || !USER_AI_KEY_PROVIDERS.includes(provider as UserAiKeyProvider)) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('user_credentials')
      .delete()
      .eq('user_id', session.user.id)
      .eq('provider', provider)

    if (error) {
      console.error('Error deleting API key')
      return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    console.error('Error deleting API key')
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 })
  }
}
