import 'server-only'

import dns from 'node:dns'
import type { Sandbox } from '@vercel/sandbox'
import type { RunLogger } from '@/lib/utils/run-logger'
import { runCommandInSandbox } from '@/lib/sandbox/commands'
import type { SupportedSandboxAgent } from '@/lib/sandbox/supported-agent'
import { SANDBOX_AGENT_CLI_VERSION, SANDBOX_AGENT_PORT } from '@/lib/sandbox/constants'

function agentBaseUrl(sandbox: Sandbox): string {
  const url = sandbox.domain(SANDBOX_AGENT_PORT)
  return url.startsWith('http') ? url : `https://${url}`
}

/** Prefer IPv4 for *.vercel.run to avoid slow or broken IPv6 paths from Node fetch. */
function preferIpv4ForFetch(): void {
  try {
    dns.setDefaultResultOrder('ipv4first')
  } catch {
    // ignore
  }
}

/** Undici may honor HTTP_PROXY; public sandbox hostnames should bypass corporate proxies. */
function ensureVercelSandboxHostBypassesProxy(): void {
  const token = 'vercel.run'
  if (!process.env.NO_PROXY?.includes(token)) {
    process.env.NO_PROXY = process.env.NO_PROXY ? `${process.env.NO_PROXY},${token}` : token
  }
  if (!process.env.no_proxy?.includes(token)) {
    process.env.no_proxy = process.env.no_proxy ? `${process.env.no_proxy},${token}` : token
  }
}

/**
 * Wait until sandbox-agent responds on loopback inside the VM. `nohup npx ... &` returns before
 * the CLI finishes downloading and binding; polling avoids racing the public URL health check.
 */
async function waitForSandboxAgentOnLoopback(sandbox: Sandbox): Promise<void> {
  const port = SANDBOX_AGENT_PORT
  const script = `void (async()=>{for(let i=0;i<55;i++){try{const r=await fetch('http://127.0.0.1:${port}/v1/health');if(r.ok)process.exit(0)}catch(_){}await new Promise(r=>setTimeout(r,2000))}process.exit(1)})()`
  const result = await runCommandInSandbox(sandbox, 'node', ['-e', script])
  if (!result.success) {
    throw new Error('sandbox_agent_loopback_health_timeout')
  }
}

/**
 * Start sandbox-agent daemon inside the sandbox (background).
 */
export async function startSandboxAgentDaemon(
  sandbox: Sandbox,
  logger: Pick<RunLogger, 'info' | 'error'>,
): Promise<void> {
  const cmd = `nohup npx -y @sandbox-agent/cli@${SANDBOX_AGENT_CLI_VERSION} server --no-token --host 0.0.0.0 --port ${SANDBOX_AGENT_PORT} > /tmp/sandbox-agent.log 2>&1 &`
  const result = await runCommandInSandbox(sandbox, 'sh', ['-c', cmd])
  if (!result.success) {
    await logger.error('Failed to start sandbox-agent process')
    throw new Error('sandbox_agent_start_failed')
  }
  await logger.info('Sandbox agent server starting')
  await new Promise((r) => setTimeout(r, 2000))
  try {
    await waitForSandboxAgentOnLoopback(sandbox)
  } catch {
    await logger.error('Sandbox agent did not respond inside the sandbox')
    throw new Error('sandbox_agent_loopback_health_timeout')
  }
  await logger.info('Sandbox agent process is listening')
}

async function waitForAgentHealth(
  baseUrl: string,
  timeoutMs: number,
  logger?: Pick<RunLogger, 'info'>,
  runId?: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const healthUrl = `${baseUrl.replace(/\/$/, '')}/v1/health`
  let attempt = 0
  while (Date.now() < deadline) {
    attempt++
    if (attempt === 1 || attempt % 5 === 0) {
      // #region agent log
      fetch('http://127.0.0.1:7376/ingest/534c46bf-e822-48f8-b333-a1bc7bc322d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '57db9e' },
        body: JSON.stringify({
          sessionId: '57db9e',
          runId: runId ?? null,
          hypothesisId: 'H2',
          location: 'lib/sandbox/agent-client.ts:waitForAgentHealth:attempt',
          message: 'public health probe attempt',
          data: { attempt, timeoutMs },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
    }
    if (logger && attempt > 1 && attempt % 6 === 1) {
      void logger.info('Still waiting for sandbox agent endpoint')
    }
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(8000) })
      if (res.ok) {
        // #region agent log
        fetch('http://127.0.0.1:7376/ingest/534c46bf-e822-48f8-b333-a1bc7bc322d8', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '57db9e' },
          body: JSON.stringify({
            sessionId: '57db9e',
            runId: runId ?? null,
            hypothesisId: 'H5',
            location: 'lib/sandbox/agent-client.ts:waitForAgentHealth:success',
            message: 'public health probe succeeded',
            data: { attempt },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        return
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  // #region agent log
  fetch('http://127.0.0.1:7376/ingest/534c46bf-e822-48f8-b333-a1bc7bc322d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '57db9e' },
    body: JSON.stringify({
      sessionId: '57db9e',
      runId: runId ?? null,
      hypothesisId: 'H2',
      location: 'lib/sandbox/agent-client.ts:waitForAgentHealth:timeout',
      message: 'public health probe timed out',
      data: { attempts: attempt, timeoutMs },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  throw new Error('sandbox_agent_health_timeout')
}

/**
 * Connect to sandbox-agent, run one prompt, map session events to run_events, return assistant text if any.
 */
export async function executeCodingAgentSession(
  sandbox: Sandbox,
  agent: SupportedSandboxAgent,
  prompt: string,
  logger: RunLogger,
  options?: { selectedModel?: string; runId?: string },
): Promise<{ success: boolean; agentResponse?: string; error?: string; sessionId?: string }> {
  preferIpv4ForFetch()
  ensureVercelSandboxHostBypassesProxy()

  const baseUrl = agentBaseUrl(sandbox)

  // #region agent log
  fetch('http://127.0.0.1:7376/ingest/534c46bf-e822-48f8-b333-a1bc7bc322d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '57db9e' },
    body: JSON.stringify({
      sessionId: '57db9e',
      runId: options?.runId ?? null,
      hypothesisId: 'H1',
      location: 'lib/sandbox/agent-client.ts:execute:start',
      message: 'agent session starting',
      data: { agent, hasModel: !!options?.selectedModel },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion

  await logger.info('Connecting to sandbox agent on public URL')
  await waitForAgentHealth(baseUrl, 20_000, logger, options?.runId)

  await logger.info('Loading sandbox agent SDK')
  // #region agent log
  fetch('http://127.0.0.1:7376/ingest/534c46bf-e822-48f8-b333-a1bc7bc322d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '57db9e' },
    body: JSON.stringify({
      sessionId: '57db9e',
      runId: options?.runId ?? null,
      hypothesisId: 'H6',
      location: 'lib/sandbox/agent-client.ts:execute:before-import',
      message: 'loading sandbox agent sdk',
      data: {},
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  const { SandboxAgent } = await import('sandbox-agent')
  await logger.info('Sandbox agent SDK loaded')
  // #region agent log
  fetch('http://127.0.0.1:7376/ingest/534c46bf-e822-48f8-b333-a1bc7bc322d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '57db9e' },
    body: JSON.stringify({
      sessionId: '57db9e',
      runId: options?.runId ?? null,
      hypothesisId: 'H6',
      location: 'lib/sandbox/agent-client.ts:execute:after-import',
      message: 'sandbox agent sdk loaded',
      data: {},
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion

  await logger.info('Connecting sandbox agent client')
  const client = await SandboxAgent.connect({
    baseUrl,
    waitForHealth: false,
  })
  await logger.info('Sandbox agent client connected')
  // #region agent log
  fetch('http://127.0.0.1:7376/ingest/534c46bf-e822-48f8-b333-a1bc7bc322d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '57db9e' },
    body: JSON.stringify({
      sessionId: '57db9e',
      runId: options?.runId ?? null,
      hypothesisId: 'H6',
      location: 'lib/sandbox/agent-client.ts:execute:after-connect',
      message: 'sandbox agent client connected',
      data: {},
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion

  try {
    await logger.info('Inspecting available agents')
    const agentList = await client.listAgents()
    const selectedAgentInfo =
      Array.isArray(agentList.agents) && agentList.agents.find((item) => item.id === agent)
        ? agentList.agents.find((item) => item.id === agent)
        : null
    await logger.info('Agent inspection completed')
    // #region agent log
    fetch('http://127.0.0.1:7376/ingest/534c46bf-e822-48f8-b333-a1bc7bc322d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '57db9e' },
      body: JSON.stringify({
        sessionId: '57db9e',
        runId: options?.runId ?? null,
        hypothesisId: 'H12-H13',
        location: 'lib/sandbox/agent-client.ts:execute:agent-list',
        message: 'agent list inspected',
        data: {
          selectedFound: selectedAgentInfo !== null,
          installed: selectedAgentInfo?.installed ?? null,
          credentialsAvailable: selectedAgentInfo?.credentialsAvailable ?? null,
          hasConfigError:
            typeof selectedAgentInfo?.configError === 'string' && selectedAgentInfo.configError.length > 0,
          hasServerStatus: selectedAgentInfo?.serverStatus != null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion

    await logger.info('Creating agent session')
    const session = await client.createSession({
      agent,
      sessionInit: {
        cwd: '/vercel/sandbox/project',
        mcpServers: [],
      },
    })
    await logger.info('Agent session created')
    // #region agent log
    fetch('http://127.0.0.1:7376/ingest/534c46bf-e822-48f8-b333-a1bc7bc322d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '57db9e' },
      body: JSON.stringify({
        sessionId: '57db9e',
        runId: options?.runId ?? null,
        hypothesisId: 'H7',
        location: 'lib/sandbox/agent-client.ts:execute:after-create-session',
        message: 'agent session created',
        data: {},
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion

    if (options?.selectedModel) {
      await logger.info('Applying model override')
      try {
        await session.setModel(options.selectedModel)
        await logger.info('Model override applied')
        // #region agent log
        fetch('http://127.0.0.1:7376/ingest/534c46bf-e822-48f8-b333-a1bc7bc322d8', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '57db9e' },
          body: JSON.stringify({
            sessionId: '57db9e',
            runId: options?.runId ?? null,
            hypothesisId: 'H8',
            location: 'lib/sandbox/agent-client.ts:execute:model-applied',
            message: 'model override applied',
            data: {},
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
      } catch {
        await logger.info('Model override not applied')
      }
    }

    let firstPermissionLogged = false
    session.onPermissionRequest((request) => {
      if (!firstPermissionLogged) {
        firstPermissionLogged = true
        void logger.info('Received permission request from agent')
        // #region agent log
        fetch('http://127.0.0.1:7376/ingest/534c46bf-e822-48f8-b333-a1bc7bc322d8', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '57db9e' },
          body: JSON.stringify({
            sessionId: '57db9e',
            runId: options?.runId ?? null,
            hypothesisId: 'H9',
            location: 'lib/sandbox/agent-client.ts:execute:first-permission',
            message: 'first permission request received',
            data: {},
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
      }
      void session.respondPermission(request.id, 'once')
    })

    let firstEventLogged = false
    const off = session.onEvent((event: { sender?: string; eventIndex?: number }) => {
      if (!firstEventLogged) {
        firstEventLogged = true
        void logger.info('Received first agent event')
        // #region agent log
        fetch('http://127.0.0.1:7376/ingest/534c46bf-e822-48f8-b333-a1bc7bc322d8', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '57db9e' },
          body: JSON.stringify({
            sessionId: '57db9e',
            runId: options?.runId ?? null,
            hypothesisId: 'H10',
            location: 'lib/sandbox/agent-client.ts:execute:first-event',
            message: 'first agent event received',
            data: { sender: event.sender ?? 'unknown' },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
      }
      void logger.appendEvent('agent_output', {
        sender: event.sender ?? 'unknown',
        index: event.eventIndex ?? 0,
      })
    })

    let agentResponse: string | undefined
    try {
      await logger.info('Sending prompt to agent')
      const result = await session.prompt([{ type: 'text', text: prompt }])
      await logger.info('Agent prompt completed')
      // #region agent log
      fetch('http://127.0.0.1:7376/ingest/534c46bf-e822-48f8-b333-a1bc7bc322d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '57db9e' },
        body: JSON.stringify({
          sessionId: '57db9e',
          runId: options?.runId ?? null,
          hypothesisId: 'H11',
          location: 'lib/sandbox/agent-client.ts:execute:prompt-complete',
          message: 'agent prompt completed',
          data: {},
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      const r = result as { stopReason?: string; messages?: unknown }
      if (r.messages != null) {
        agentResponse = safeStringify(r.messages)
      }
    } finally {
      off()
    }

    await client.destroySession(session.id)
    await client.dispose()

    return {
      success: true,
      agentResponse,
      sessionId: session.agentSessionId,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'agent_error'
    await logger.error('Agent session failed')
    try {
      await client.dispose()
    } catch {
      // ignore
    }
    return { success: false, error: message }
  }
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v)
  } catch {
    return ''
  }
}
