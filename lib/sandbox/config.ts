export function validateEnvironmentVariables(
  selectedAgent: string = 'claude',
  githubToken?: string | null,
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
  },
) {
  const errors: string[] = []

  const anthropic = apiKeys?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  const openai = apiKeys?.OPENAI_API_KEY || process.env.OPENAI_API_KEY
  const cursor = apiKeys?.CURSOR_API_KEY || process.env.CURSOR_API_KEY
  const gateway = apiKeys?.AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY

  if (selectedAgent === 'claude' && !anthropic && !gateway) {
    errors.push('Anthropic or AI Gateway API key is required for Claude. Add a key in your profile.')
  }

  if (selectedAgent === 'codex' && !openai && !gateway) {
    errors.push('OpenAI or AI Gateway API key is required for Codex. Add a key in your profile.')
  }

  if (selectedAgent === 'cursor' && !cursor) {
    errors.push('Cursor API key is required for Cursor agent. Add CURSOR_API_KEY in your profile or environment.')
  }

  if (selectedAgent === 'opencode' && !anthropic && !openai && !gateway) {
    errors.push('At least one of Anthropic, OpenAI, or AI Gateway API key is required for OpenCode.')
  }

  // Check for GitHub token for private repositories
  // Use user's token if provided
  if (!githubToken) {
    errors.push('GitHub is required for repository access. Please connect your GitHub account.')
  }

  // Check for Vercel sandbox environment variables
  if (!process.env.SANDBOX_VERCEL_TEAM_ID) {
    errors.push('SANDBOX_VERCEL_TEAM_ID is required for sandbox creation')
  }

  if (!process.env.SANDBOX_VERCEL_PROJECT_ID) {
    errors.push('SANDBOX_VERCEL_PROJECT_ID is required for sandbox creation')
  }

  if (!process.env.SANDBOX_VERCEL_TOKEN) {
    errors.push('SANDBOX_VERCEL_TOKEN is required for sandbox creation')
  }

  return {
    valid: errors.length === 0,
    error: errors.length > 0 ? errors.join(', ') : undefined,
  }
}

export function createAuthenticatedRepoUrl(repoUrl: string, githubToken?: string | null): string {
  if (!githubToken) {
    return repoUrl
  }

  try {
    const url = new URL(repoUrl)
    if (url.hostname === 'github.com') {
      // Add GitHub token for authentication
      url.username = githubToken
      url.password = 'x-oauth-basic'
    }
    return url.toString()
  } catch {
    // Failed to parse repository URL
    return repoUrl
  }
}

export function createSandboxConfiguration(config: {
  repoUrl: string
  timeout?: string
  ports?: number[]
  runtime?: string
  resources?: { vcpus?: number }
  branchName?: string
}) {
  return {
    template: 'node',
    git: {
      url: config.repoUrl,
      branch: config.branchName || 'main',
    },
    timeout: config.timeout || '20m',
    ports: config.ports || [3000],
    runtime: config.runtime || 'node22',
    resources: config.resources || { vcpus: 4 },
  }
}
