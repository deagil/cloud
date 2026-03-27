import { z } from 'zod'

// Log entry types
export const logEntrySchema = z.object({
  type: z.enum(['info', 'command', 'error', 'success']),
  message: z.string(),
  timestamp: z.date().optional(),
})

export type LogEntry = z.infer<typeof logEntrySchema>

// Users
export const insertUserSchema = z.object({
  id: z.string().optional(),
  provider: z.enum(['github', 'vercel']),
  externalId: z.string().min(1, 'External ID is required'),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  scope: z.string().optional(),
  username: z.string().min(1, 'Username is required'),
  email: z.string().email().optional(),
  name: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  lastLoginAt: z.date().optional(),
})

export const selectUserSchema = z.object({
  id: z.string(),
  provider: z.enum(['github', 'vercel']),
  externalId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  scope: z.string().nullable(),
  username: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastLoginAt: z.date(),
})

export type User = z.infer<typeof selectUserSchema>
export type InsertUser = z.infer<typeof insertUserSchema>

// Tasks
export const insertTaskSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  title: z.string().optional(),
  repoUrl: z.string().url('Must be a valid URL').optional(),
  selectedAgent: z.enum(['claude', 'codex', 'cursor', 'opencode']).default('claude'),
  selectedModel: z.string().optional(),
  installDependencies: z.boolean().default(false),
  maxDuration: z.number().default(parseInt(process.env.MAX_SANDBOX_DURATION || '300', 10)),
  keepAlive: z.boolean().default(false),
  enableBrowser: z.boolean().default(false),
  status: z.enum(['pending', 'processing', 'completed', 'error', 'stopped']).default('pending'),
  progress: z.number().min(0).max(100).default(0),
  logs: z.array(logEntrySchema).optional(),
  error: z.string().optional(),
  branchName: z.string().optional(),
  sandboxId: z.string().optional(),
  agentSessionId: z.string().optional(),
  sandboxUrl: z.string().optional(),
  previewUrl: z.string().optional(),
  prUrl: z.string().optional(),
  prNumber: z.number().optional(),
  prStatus: z.enum(['open', 'closed', 'merged']).optional(),
  prMergeCommitSha: z.string().optional(),
  mcpServerIds: z.array(z.string()).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  completedAt: z.date().optional(),
  deletedAt: z.date().optional(),
})

export const selectTaskSchema = z.object({
  id: z.string(),
  userId: z.string(),
  threadId: z.string().uuid().nullable().optional(),
  prompt: z.string(),
  title: z.string().nullable(),
  repoUrl: z.string().nullable(),
  selectedAgent: z.string().nullable(),
  selectedModel: z.string().nullable(),
  installDependencies: z.boolean().nullable(),
  maxDuration: z.number().nullable(),
  keepAlive: z.boolean().nullable(),
  enableBrowser: z.boolean().nullable(),
  status: z.enum(['pending', 'processing', 'completed', 'error', 'stopped']),
  progress: z.number().nullable(),
  logs: z.array(logEntrySchema).nullable(),
  error: z.string().nullable(),
  branchName: z.string().nullable(),
  sandboxId: z.string().nullable(),
  agentSessionId: z.string().nullable(),
  sandboxUrl: z.string().nullable(),
  previewUrl: z.string().nullable(),
  prUrl: z.string().nullable(),
  prNumber: z.number().nullable(),
  prStatus: z.enum(['open', 'closed', 'merged']).nullable(),
  prMergeCommitSha: z.string().nullable(),
  mcpServerIds: z.array(z.string()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().nullable(),
  deletedAt: z.date().nullable(),
})

export type Task = z.infer<typeof selectTaskSchema>
export type InsertTask = z.infer<typeof insertTaskSchema>

// Connectors
export const insertConnectorSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  type: z.enum(['local', 'remote']).default('remote'),
  baseUrl: z.string().url('Must be a valid URL').optional(),
  oauthClientId: z.string().optional(),
  oauthClientSecret: z.string().optional(),
  command: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  status: z.enum(['connected', 'disconnected']).default('disconnected'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectConnectorSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(['local', 'remote']),
  baseUrl: z.string().nullable(),
  oauthClientId: z.string().nullable(),
  oauthClientSecret: z.string().nullable(),
  command: z.string().nullable(),
  env: z.string().nullable(),
  status: z.enum(['connected', 'disconnected']),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Connector = z.infer<typeof selectConnectorSchema>
export type InsertConnector = z.infer<typeof insertConnectorSchema>

// Accounts
export const insertAccountSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  provider: z.enum(['github']).default('github'),
  externalUserId: z.string().min(1, 'External user ID is required'),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.date().optional(),
  scope: z.string().optional(),
  username: z.string().min(1, 'Username is required'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectAccountSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.enum(['github']),
  externalUserId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  expiresAt: z.date().nullable(),
  scope: z.string().nullable(),
  username: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Account = z.infer<typeof selectAccountSchema>
export type InsertAccount = z.infer<typeof insertAccountSchema>

// Keys
export const insertKeySchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  provider: z.enum(['anthropic', 'openai', 'cursor', 'gemini', 'aigateway']),
  value: z.string().min(1, 'API key value is required'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectKeySchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.enum(['anthropic', 'openai', 'cursor', 'gemini', 'aigateway']),
  value: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Key = z.infer<typeof selectKeySchema>
export type InsertKey = z.infer<typeof insertKeySchema>

// Task messages
export const insertTaskMessageSchema = z.object({
  id: z.string().optional(),
  taskId: z.string().min(1, 'Task ID is required'),
  role: z.enum(['user', 'agent']),
  content: z.string().min(1, 'Content is required'),
  createdAt: z.date().optional(),
})

export const selectTaskMessageSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  role: z.enum(['user', 'agent']),
  content: z.string(),
  createdAt: z.date(),
})

export type TaskMessage = z.infer<typeof selectTaskMessageSchema>
export type InsertTaskMessage = z.infer<typeof insertTaskMessageSchema>

// Settings
export const insertSettingSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
  key: z.string().min(1, 'Key is required'),
  value: z.string().min(1, 'Value is required'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectSettingSchema = z.object({
  id: z.string(),
  userId: z.string(),
  key: z.string(),
  value: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Setting = z.infer<typeof selectSettingSchema>
export type InsertSetting = z.infer<typeof insertSettingSchema>

// Legacy aliases
export type UserConnection = Account
export type InsertUserConnection = InsertAccount
export const userConnections = 'accounts' as const
