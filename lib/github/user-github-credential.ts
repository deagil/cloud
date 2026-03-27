import 'server-only'

import { decrypt, encrypt } from '@/lib/crypto'

export interface GitHubOAuthCredentialPayload {
  accessToken: string
  scope: string
  username: string
  externalUserId: string
}

export function encryptGitHubOAuthPayload(payload: GitHubOAuthCredentialPayload): string {
  return encrypt(JSON.stringify(payload))
}

/**
 * Plaintext after AES decrypt: JSON payload, or legacy single access token string.
 */
export function parseDecryptedGitHubCredential(plaintext: string): GitHubOAuthCredentialPayload | null {
  try {
    const o = JSON.parse(plaintext) as Partial<GitHubOAuthCredentialPayload>
    if (typeof o.accessToken === 'string' && o.accessToken.length > 0) {
      return {
        accessToken: o.accessToken,
        scope: typeof o.scope === 'string' ? o.scope : '',
        username: typeof o.username === 'string' ? o.username : '',
        externalUserId: typeof o.externalUserId === 'string' ? o.externalUserId : '',
      }
    }
  } catch {
    if (plaintext.length > 0) {
      return {
        accessToken: plaintext,
        scope: '',
        username: '',
        externalUserId: '',
      }
    }
  }
  return null
}

export function decryptStoredGitHubCredential(encryptedSecret: string): GitHubOAuthCredentialPayload | null {
  try {
    return parseDecryptedGitHubCredential(decrypt(encryptedSecret))
  } catch {
    return null
  }
}
