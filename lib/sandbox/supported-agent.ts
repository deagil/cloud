import type { AgentType } from '@/lib/sandbox/agent-types'

/** Agents supported by Sandbox Agent daemon in this app. */
export const SUPPORTED_SANDBOX_AGENTS = ['claude', 'codex', 'cursor', 'opencode'] as const

export type SupportedSandboxAgent = (typeof SUPPORTED_SANDBOX_AGENTS)[number]

export function isSupportedSandboxAgent(agent: string): agent is SupportedSandboxAgent {
  return (SUPPORTED_SANDBOX_AGENTS as readonly string[]).includes(agent)
}

export function toSupportedSandboxAgent(agent: AgentType): SupportedSandboxAgent | null {
  return isSupportedSandboxAgent(agent) ? agent : null
}

export function assertSupportedAgent(agent: string): SupportedSandboxAgent {
  if (!isSupportedSandboxAgent(agent)) {
    throw new Error('unsupported_agent')
  }
  return agent
}
