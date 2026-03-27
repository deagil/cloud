import 'server-only'

import crypto from 'crypto'

export function verifySlackRequest(
  signingSecret: string,
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
): boolean {
  if (!timestampHeader || !signatureHeader) return false
  const ts = parseInt(timestampHeader, 10)
  if (Number.isNaN(ts)) return false
  if (Math.abs(Date.now() / 1000 - ts) > 60 * 5) return false

  const sigBasestring = `v0:${timestampHeader}:${rawBody}`
  const hmac = crypto.createHmac('sha256', signingSecret).update(sigBasestring, 'utf8').digest('hex')
  const expected = `v0=${hmac}`
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signatureHeader, 'utf8'))
  } catch {
    return false
  }
}
