/** AI / gateway keys stored in `user_credentials` (not `github`). */
export const USER_AI_KEY_PROVIDERS = ['openai', 'gemini', 'cursor', 'anthropic', 'aigateway'] as const

export type UserAiKeyProvider = (typeof USER_AI_KEY_PROVIDERS)[number]

export function isUserAiKeyProvider(p: string): p is UserAiKeyProvider {
  return (USER_AI_KEY_PROVIDERS as readonly string[]).includes(p)
}
