/** Structured error codes for API and execution responses. */

export const ErrorCodes = {
  AI_CREDENTIALS_REQUIRED: 'ai_credentials_required',
  GITHUB_CREDENTIALS_REQUIRED: 'github_credentials_required',
  UNSUPPORTED_AGENT: 'unsupported_agent',
  RUN_NOT_FOUND: 'run_not_found',
  THREAD_NOT_FOUND: 'thread_not_found',
  UNAUTHORIZED: 'unauthorized',
  SANDBOX_FAILED: 'sandbox_failed',
  AGENT_FAILED: 'agent_failed',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]
