import { redirect } from 'next/navigation'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; next?: string; error?: string }>
}) {
  const sp = await searchParams
  const q = new URLSearchParams()
  if (sp.redirect) q.set('redirect', sp.redirect)
  if (sp.next) q.set('next', sp.next)
  if (sp.error) q.set('error', sp.error)
  const suffix = q.toString() ? `?${q.toString()}` : ''
  redirect(`/login${suffix}`)
}
