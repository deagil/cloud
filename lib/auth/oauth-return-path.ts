/**
 * After OAuth, never send the user back to a URL that encodes a prior GitHub config error.
 */
export function safeOAuthReturnPath(path: string): string {
  const p = path.trim() || '/'
  if (p.includes('github_not_configured') || p.includes('github_connect_failed')) {
    return '/'
  }
  return p.startsWith('/') ? p : '/'
}
