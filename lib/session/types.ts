export type AuthProvider = 'github' | 'vercel' | 'email'

export interface SessionUserInfo {
  user: User | undefined
  authProvider?: AuthProvider
}

export interface Tokens {
  accessToken: string
  expiresAt?: number
  refreshToken?: string
}

export interface Session {
  created: number
  authProvider: AuthProvider
  user: User
}

export interface User {
  id: string // Internal user ID (from users table)
  username: string
  email: string | undefined
  avatar: string
  name?: string
}
