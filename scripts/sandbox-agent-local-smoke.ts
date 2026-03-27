/**
 * Local Sandbox Agent smoke test — no Vercel Sandbox, no Next.js server.
 *
 * 1. Terminal A: npx @sandbox-agent/cli@0.4.2 server --no-token --host 127.0.0.1 --port 2468
 * 2. Put API keys in `.env.local` (same vars the app uses for your agent), e.g. ANTHROPIC_API_KEY or CURSOR_API_KEY
 * 3. Set SANDBOX_AGENT_SMOKE_CWD to an absolute path to a repo checkout on this machine
 * 4. Run: pnpm sandbox-agent:smoke
 *
 * Optional: SANDBOX_AGENT_SMOKE_URL (default http://127.0.0.1:2468), SANDBOX_AGENT_SMOKE_AGENT,
 * SANDBOX_AGENT_SMOKE_MODEL, SANDBOX_AGENT_SMOKE_PROMPT
 *
 * Inspector UI: http://127.0.0.1:2468/ui/
 *
 * Note: `sandbox-agent` is loaded via dynamic `import()` so Node uses the package's ESM export map under tsx (static import can throw ERR_PACKAGE_PATH_NOT_EXPORTED).
 *
 * If the script seems stuck on "Connecting…", keep the CLI running in another terminal. If you use HTTP(S)_PROXY in `.env.local`, localhost is excluded automatically below so health checks do not hang on the proxy.
 */

import { config } from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { isSupportedSandboxAgent } from '@/lib/sandbox/supported-agent'

config({ path: resolve(process.cwd(), '.env.local'), quiet: true })
config({ path: resolve(process.cwd(), '.env'), quiet: true })

/** Node fetch may honor HTTP_PROXY; ensure 127.0.0.1 / localhost skip the proxy. */
function ensureLocalhostBypassesProxy(): void {
  const suffix = '127.0.0.1,localhost,::1'
  process.env.NO_PROXY = process.env.NO_PROXY ? `${suffix},${process.env.NO_PROXY}` : suffix
  process.env.no_proxy = process.env.no_proxy ? `${suffix},${process.env.no_proxy}` : suffix
}

function parseArgs(): { cwd?: string; prompt?: string; agent?: string } {
  const out: { cwd?: string; prompt?: string; agent?: string } = {}
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--cwd=')) out.cwd = arg.slice(6)
    else if (arg.startsWith('--prompt=')) out.prompt = arg.slice(9)
    else if (arg.startsWith('--agent=')) out.agent = arg.slice(8)
  }
  return out
}

async function main(): Promise<void> {
  ensureLocalhostBypassesProxy()

  const args = parseArgs()
  const baseUrl = process.env.SANDBOX_AGENT_SMOKE_URL ?? 'http://127.0.0.1:2468'
  const cwd = args.cwd ?? process.env.SANDBOX_AGENT_SMOKE_CWD?.trim() ?? ''

  if (!cwd || !existsSync(cwd)) {
    console.error(
      'Missing or invalid working directory. Set SANDBOX_AGENT_SMOKE_CWD to an absolute path to a repo, or pass --cwd=/path/to/repo',
    )
    process.exit(1)
  }

  const agentCandidate = args.agent ?? process.env.SANDBOX_AGENT_SMOKE_AGENT ?? 'claude'
  if (!isSupportedSandboxAgent(agentCandidate)) {
    console.error('Agent must be one of: claude, codex, cursor, opencode')
    process.exit(1)
  }

  const prompt = args.prompt ?? process.env.SANDBOX_AGENT_SMOKE_PROMPT ?? 'Reply with exactly: smoke test ok'

  const model = process.env.SANDBOX_AGENT_SMOKE_MODEL?.trim() || undefined

  // Dynamic import: package exports only "import", not "require" — tsx would otherwise hit ERR_PACKAGE_PATH_NOT_EXPORTED
  const { SandboxAgent } = await import('sandbox-agent')

  console.error(
    'Connecting to sandbox-agent. First API call waits until /v1/health is OK (SDK logs warnings to stderr if not). Ensure CLI is running: npx @sandbox-agent/cli@0.4.2 server --no-token --host 127.0.0.1 --port 2468',
  )

  const client = await SandboxAgent.connect({ baseUrl })

  try {
    const session = await client.createSession({
      agent: agentCandidate,
      sessionInit: {
        cwd: resolve(cwd),
        mcpServers: [],
      },
    })

    if (model) {
      try {
        await session.setModel(model)
      } catch {
        console.error('Model override failed (continuing with default)')
      }
    }

    session.onPermissionRequest((request) => {
      void session.respondPermission(request.id, 'once')
    })

    const result = await session.prompt([{ type: 'text', text: prompt }])
    const r = result as { stopReason?: string; messages?: unknown }

    console.error('Prompt finished')
    if (r.stopReason != null) console.error('Stop reason present in result')
    if (r.messages != null) {
      const text = typeof r.messages === 'string' ? r.messages : JSON.stringify(r.messages)
      process.stdout.write(text)
      process.stdout.write('\n')
    }

    await client.destroySession(session.id)
  } finally {
    await client.dispose()
  }
}

main().catch((e) => {
  console.error('Smoke test failed')
  if (e instanceof Error && e.message) console.error(e.message)
  process.exit(1)
})
