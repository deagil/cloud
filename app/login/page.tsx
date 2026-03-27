import { LoginForm } from '@/components/login-form'
import { isRelativeUrl } from '@/lib/utils/is-relative-url'

function resolvePostLoginRedirect(sp: { redirect?: string; next?: string }): string {
  const raw = sp.redirect ?? sp.next ?? '/'
  return isRelativeUrl(raw) ? raw : '/'
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; next?: string }>
}) {
  const sp = await searchParams
  const defaultRedirect = resolvePostLoginRedirect(sp)

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm defaultRedirect={defaultRedirect} />
      </div>
    </div>
  )
}
