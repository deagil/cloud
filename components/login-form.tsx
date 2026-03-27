'use client'

import * as React from 'react'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { GalleryVerticalEnd } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSetAtom } from 'jotai'

import { GitHubIcon } from '@/components/icons/github-icon'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { getEnabledAuthProviders } from '@/lib/auth/providers'
import { createClient } from '@/lib/supabase/client'
import { redirectToSignIn } from '@/lib/session/redirect-to-sign-in'
import { sessionAtom } from '@/lib/atoms/session'
import { isRelativeUrl } from '@/lib/utils/is-relative-url'
import { cn } from '@/lib/utils'
import type { SessionUserInfo } from '@/lib/session/types'

export interface LoginFormProps extends React.ComponentProps<'div'> {
  /** Validated relative path (from server) to use after successful sign-in */
  defaultRedirect: string
}

export function LoginForm({ className, defaultRedirect, ...props }: LoginFormProps) {
  const router = useRouter()
  const setSession = useSetAtom(sessionAtom)
  const { github: hasGitHub, vercel: hasVercel } = getEnabledAuthProviders()

  const [step, setStep] = React.useState<'email' | 'otp'>('email')
  const [email, setEmail] = React.useState('')
  const [otp, setOtp] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [sending, setSending] = React.useState(false)
  const [verifying, setVerifying] = React.useState(false)
  const [loadingVercel, setLoadingVercel] = React.useState(false)
  const [loadingGitHub, setLoadingGitHub] = React.useState(false)

  const safeRedirect = defaultRedirect.length > 0 && isRelativeUrl(defaultRedirect) ? defaultRedirect : '/'

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSending(true)
    try {
      const supabase = createClient()
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      })
      if (otpError) {
        setError('Could not send sign-in code. Try again.')
        return
      }
      setStep('otp')
      setOtp('')
    } finally {
      setSending(false)
    }
  }

  const verifyInFlightRef = React.useRef(false)

  const verifyWithToken = React.useCallback(
    async (token: string) => {
      if (token.length !== 6 || verifyInFlightRef.current) return
      verifyInFlightRef.current = true
      setError(null)
      setVerifying(true)
      try {
        const supabase = createClient()
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token,
          type: 'email',
        })
        if (verifyError) {
          setError('Invalid or expired code. Try again.')
          return
        }
        const bootstrapRes = await fetch('/api/auth/bootstrap', { method: 'POST' })
        if (!bootstrapRes.ok) {
          setError('Signed in but setup failed. Try refreshing the page.')
          return
        }
        const infoRes = await fetch('/api/auth/info')
        if (infoRes.ok) {
          const data = (await infoRes.json()) as SessionUserInfo
          setSession(data)
        }
        router.refresh()
        router.push(safeRedirect)
      } finally {
        verifyInFlightRef.current = false
        setVerifying(false)
      }
    },
    [email, router, safeRedirect, setSession],
  )

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length !== 6) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    await verifyWithToken(otp)
  }

  const handleVercelSignIn = async () => {
    setLoadingVercel(true)
    await redirectToSignIn(safeRedirect)
  }

  const handleGitHubSignIn = () => {
    setLoadingGitHub(true)
    const params = new URLSearchParams({ next: safeRedirect })
    window.location.href = `/api/auth/signin/github?${params.toString()}`
  }

  const handleResend = async () => {
    setError(null)
    setSending(true)
    try {
      const supabase = createClient()
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      })
      if (otpError) {
        setError('Could not resend code. Try again.')
        return
      }
      setOtp('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      {step === 'email' ? (
        <form onSubmit={handleSendCode}>
          <FieldGroup>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex flex-col items-center gap-2 font-medium">
                <div className="flex size-8 items-center justify-center rounded-md">
                  <GalleryVerticalEnd className="size-6" />
                </div>
              </div>
              <h1 className="text-xl font-bold">Sign in</h1>
              <FieldDescription>
                Enter your email — we&apos;ll send a code to sign in or create your account.
              </FieldDescription>
            </div>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                disabled={sending}
              />
            </Field>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Field>
              <Button type="submit" disabled={sending}>
                {sending ? 'Sending…' : 'Continue with email'}
              </Button>
            </Field>
            {(hasVercel || hasGitHub) && (
              <>
                <FieldSeparator>Or</FieldSeparator>
                <Field className="flex flex-col gap-3">
                  {hasVercel && (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="w-full"
                      onClick={handleVercelSignIn}
                      disabled={loadingVercel || loadingGitHub || sending}
                    >
                      {loadingVercel ? (
                        <>
                          <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Loading…
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 76 65" className="mr-2 h-3 w-3" fill="currentColor">
                            <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                          </svg>
                          Continue with Vercel
                        </>
                      )}
                    </Button>
                  )}
                  {hasGitHub && (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="w-full"
                      onClick={handleGitHubSignIn}
                      disabled={loadingVercel || loadingGitHub || sending}
                    >
                      {loadingGitHub ? (
                        <>
                          <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Loading…
                        </>
                      ) : (
                        <>
                          <GitHubIcon className="mr-2 h-4 w-4" />
                          Continue with GitHub
                        </>
                      )}
                    </Button>
                  )}
                </Field>
              </>
            )}
          </FieldGroup>
        </form>
      ) : (
        <form onSubmit={handleVerifySubmit}>
          <FieldGroup>
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-xl font-bold">Check your email</h1>
              <FieldDescription>Enter the 6-digit code we sent to your inbox.</FieldDescription>
            </div>
            <Field>
              <FieldLabel htmlFor="otp">Verification code</FieldLabel>
              <InputOTP
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                value={otp}
                onChange={(value) => {
                  setOtp(value)
                  setError(null)
                }}
                onComplete={(value) => {
                  void verifyWithToken(value)
                }}
                disabled={verifying}
                id="otp"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </Field>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Field className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={verifying || otp.length !== 6}>
                {verifying ? 'Verifying…' : 'Verify'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setStep('email')} disabled={verifying}>
                Back
              </Button>
            </Field>
            <Field>
              <Button type="button" variant="link" className="h-auto p-0" onClick={handleResend} disabled={sending}>
                {sending ? 'Sending…' : 'Resend code'}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      )}
      <FieldDescription className="px-6 text-center">
        By continuing, you agree to our <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}
