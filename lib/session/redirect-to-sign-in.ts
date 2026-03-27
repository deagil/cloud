import { isRelativeUrl } from '@/lib/utils/is-relative-url'

/**
 * @param next - Safe relative path to return to after Vercel OAuth (e.g. from login page). Falls back to current pathname.
 */
export async function redirectToSignIn(next?: string): Promise<void> {
  const nextPath = next !== undefined && next.length > 0 && isRelativeUrl(next) ? next : window.location.pathname

  const response = await fetch(
    `/api/auth/signin/vercel?${new URLSearchParams({
      next: nextPath,
    }).toString()}`,
    { method: 'POST' },
  )

  const { url } = await response.json()
  window.location = url
  if (window.location.hash) {
    window.location.reload()
  }
}
