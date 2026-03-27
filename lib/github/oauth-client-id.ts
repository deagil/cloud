import 'server-only'

/**
 * GitHub OAuth App client ID (public, non-secret).
 * Use NEXT_PUBLIC_GITHUB_CLIENT_ID for client bundles; GITHUB_CLIENT_ID is a server-only
 * alias so Route Handlers still resolve the ID when public env is missing or not loaded.
 */
export function getGitHubOAuthClientId(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID
  const trimmed = raw?.trim()
  return trimmed || undefined
}
