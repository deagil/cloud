'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z, ZodError } from 'zod'
import { encrypt } from '@/lib/crypto'
import { mapConnectorRowToConnector } from '@/lib/connectors/map-row'
import { getProfileByUserId, ensurePersonalWorkspace } from '@/lib/db/profiles'
import { getServerSession } from '@/lib/session/get-server-session'
import { createClient } from '@/lib/supabase/server'

function buildEncryptedEnv(
  env?: Record<string, string>,
  oauthClientId?: string,
  oauthClientSecret?: string,
): string | null {
  const merged: Record<string, string> = { ...(env ?? {}) }
  if (oauthClientId) merged.oauthClientId = oauthClientId
  if (oauthClientSecret) merged.oauthClientSecret = oauthClientSecret
  if (Object.keys(merged).length === 0) return null
  return encrypt(JSON.stringify(merged))
}

const insertConnectorSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  type: z.enum(['local', 'remote']).default('remote'),
  baseUrl: z.string().url('Must be a valid URL').optional(),
  oauthClientId: z.string().optional(),
  oauthClientSecret: z.string().optional(),
  command: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  status: z.enum(['connected', 'disconnected']).default('disconnected'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

type FormState = {
  success: boolean
  message: string
  errors: Record<string, string>
}

export async function createConnector(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const session = await getServerSession()

    if (!session?.user?.id) {
      return {
        success: false,
        message: 'Unauthorized',
        errors: {},
      }
    }

    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const type = (formData.get('type') as string) || 'remote'
    const baseUrl = formData.get('baseUrl') as string
    const oauthClientId = formData.get('oauthClientId') as string
    const oauthClientSecret = formData.get('oauthClientSecret') as string
    const command = formData.get('command') as string
    const envJson = formData.get('env') as string

    const connectorData = {
      id: randomUUID(),
      userId: session.user.id,
      name,
      description: description?.trim() || undefined,
      type: type as 'local' | 'remote',
      baseUrl: baseUrl?.trim() || undefined,
      oauthClientId: oauthClientId?.trim() || undefined,
      oauthClientSecret: oauthClientSecret?.trim() || undefined,
      command: command?.trim() || undefined,
      env: envJson ? JSON.parse(envJson) : undefined,
      status: 'connected' as const,
    }

    const validatedData = insertConnectorSchema.parse(connectorData)

    const profile = await getProfileByUserId(session.user.id)
    const slug = profile?.username?.trim() || session.user.id.slice(0, 8)
    const workspaceId = await ensurePersonalWorkspace(session.user.id, slug)

    const supabase = await createClient()
    const { error } = await supabase.from('connectors').insert({
      id: validatedData.id ?? randomUUID(),
      workspace_id: workspaceId,
      created_by: session.user.id,
      name: validatedData.name,
      type: validatedData.type,
      base_url: validatedData.baseUrl || null,
      command: validatedData.command || null,
      env: buildEncryptedEnv(validatedData.env, validatedData.oauthClientId, validatedData.oauthClientSecret),
      status: validatedData.status,
    })

    if (error) throw new Error(error.message)

    revalidatePath('/')

    return {
      success: true,
      message: 'Connector created successfully',
      errors: {},
    }
  } catch (error) {
    console.error('Error creating connector:', error)

    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {}
      error.issues.forEach((issue) => {
        if (issue.path.length > 0) {
          fieldErrors[issue.path[0] as string] = issue.message
        }
      })

      return {
        success: false,
        message: 'Validation failed',
        errors: fieldErrors,
      }
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create connector',
      errors: {},
    }
  }
}

export async function toggleConnectorStatus(id: string, status: 'connected' | 'disconnected') {
  'use server'

  try {
    const session = await getServerSession()

    if (!session?.user?.id) {
      return {
        success: false,
        message: 'Unauthorized',
      }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('connectors').update({ status }).eq('id', id)

    if (error) throw new Error(error.message)

    revalidatePath('/')

    return {
      success: true,
      message: `Connector ${status === 'connected' ? 'connected' : 'disconnected'} successfully`,
    }
  } catch (error) {
    console.error('Error toggling connector status:', error)

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update connector status',
    }
  }
}

export async function updateConnector(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const session = await getServerSession()

    if (!session?.user?.id) {
      return {
        success: false,
        message: 'Unauthorized',
        errors: {},
      }
    }

    const id = formData.get('id') as string

    if (!id) {
      return {
        success: false,
        message: 'Connector ID is required',
        errors: {},
      }
    }

    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const type = (formData.get('type') as string) || 'remote'
    const baseUrl = formData.get('baseUrl') as string
    const oauthClientId = formData.get('oauthClientId') as string
    const oauthClientSecret = formData.get('oauthClientSecret') as string
    const command = formData.get('command') as string
    const envJson = formData.get('env') as string

    const connectorData = {
      userId: session.user.id,
      name,
      description: description?.trim() || undefined,
      type: type as 'local' | 'remote',
      baseUrl: baseUrl?.trim() || undefined,
      oauthClientId: oauthClientId?.trim() || undefined,
      oauthClientSecret: oauthClientSecret?.trim() || undefined,
      command: command?.trim() || undefined,
      env: envJson ? JSON.parse(envJson) : undefined,
      status: 'connected' as const,
    }

    const validatedData = insertConnectorSchema.parse(connectorData)

    const supabase = await createClient()
    const { error } = await supabase
      .from('connectors')
      .update({
        name: validatedData.name,
        type: validatedData.type,
        base_url: validatedData.baseUrl || null,
        command: validatedData.command || null,
        env: buildEncryptedEnv(validatedData.env, validatedData.oauthClientId, validatedData.oauthClientSecret),
        status: validatedData.status,
      })
      .eq('id', id)

    if (error) throw new Error(error.message)

    revalidatePath('/')

    return {
      success: true,
      message: 'Connector updated successfully',
      errors: {},
    }
  } catch (error) {
    console.error('Error updating connector:', error)

    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {}
      error.issues.forEach((issue) => {
        if (issue.path.length > 0) {
          fieldErrors[issue.path[0] as string] = issue.message
        }
      })

      return {
        success: false,
        message: 'Validation failed',
        errors: fieldErrors,
      }
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update connector',
      errors: {},
    }
  }
}

export async function deleteConnector(id: string) {
  'use server'

  try {
    const session = await getServerSession()

    if (!session?.user?.id) {
      return {
        success: false,
        message: 'Unauthorized',
      }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('connectors').delete().eq('id', id)

    if (error) throw new Error(error.message)

    revalidatePath('/')

    return {
      success: true,
      message: 'Connector deleted successfully',
    }
  } catch (error) {
    console.error('Error deleting connector:', error)

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete connector',
    }
  }
}

export async function getConnectors() {
  try {
    const session = await getServerSession()

    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
        data: [],
      }
    }

    const supabase = await createClient()
    const { data: userConnectors, error } = await supabase.from('connectors').select('*')

    if (error) throw new Error(error.message)

    const decryptedConnectors = (userConnectors ?? []).map((row) => mapConnectorRowToConnector(row, session.user.id))

    return {
      success: true,
      data: decryptedConnectors,
    }
  } catch (error) {
    console.error('Error fetching connectors:', error)

    return {
      success: false,
      error: 'Failed to fetch connectors',
      data: [],
    }
  }
}
