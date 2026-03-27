# Implementation Progress

Transforming the `coding-agent-template` into a Slack-native multi-tenant coding agent control plane.
Full plan: `/Users/dylangilchrist/.claude/plans/curried-herding-penguin.md`

---

## Phase 1 — Foundation ✅ Complete

Supabase Auth + multi-tenant schema. Execution and APIs now use **`runs`** / **`threads`** (see Phase 2); legacy **`app/api/tasks/`** has been removed.

### Done
- **Dependencies** — removed `drizzle-orm`, `drizzle-kit`, `jose`, `arctic`, `@neondatabase/serverless`, `postgres`; added `@supabase/supabase-js`, `@supabase/ssr` (see Phase 2 for **`sandbox-agent`**, Phase 3 for **`@slack/web-api`**)
- **`lib/supabase/server.ts`** — cookie-based server client (respects RLS)
- **`lib/supabase/client.ts`** — browser client
- **`lib/supabase/admin.ts`** — service role client for background jobs/webhooks (bypasses RLS)
- **`middleware.ts`** — Supabase session refresh + route protection
- **`lib/session/get-server-session.ts`** — Supabase Auth session helper for API routes and server components
- **`lib/db/profiles.ts`** — `getProfileByUserId()`, `upsertProfile()`, `ensurePersonalWorkspace()`
- **`lib/db/client.ts`** — runtime-error stub; routes using old `db` object fail with clear message
- **`lib/types/database.ts`** — full Supabase Database type definition
- **`lib/types/workspace.ts`**, **`project.ts`**, **`thread.ts`**, **`run.ts`** — domain interfaces + row mappers
- **`lib/utils/run-logger.ts`** — append-only `RunLogger` backed by `run_events` inserts; each insert triggers Supabase Realtime automatically (replaces `TaskLogger` read-modify-write pattern)
- **`lib/utils/logging.ts`** — `LogEntry` type moved inline (no longer imported from Drizzle schema)
- **`app/api/auth/callback/route.ts`** — Supabase OAuth callback; upserts profile, auto-creates personal workspace on first sign-in
- **`app/api/auth/signout/route.ts`** — calls `supabase.auth.signOut()`
- **`.env.example`** — updated with all new env vars
- **SQL migrations** (`supabase/migrations/`)
  - `0001` — full multi-tenant schema: `profiles`, `workspaces`, `workspace_members`, `workspace_integrations`, `workspace_credentials`, `user_credentials`, `projects`, `threads`, `runs`, `run_events`, `run_messages`, `review_runs`, `github_app_installations`, `slack_workspace_mappings`, `connectors`
  - `0002` — Row Level Security policies on every table (workspace-scoped access, service role for background writes)
  - `0003` — Supabase Realtime enabled for `runs`, `run_events`, `review_runs`
  - `0004` — Storage buckets: `run-artifacts` (private) + `profile-photos` (public)
  - `0005` — Legacy `tasks` / `task_messages` (optional; app targets `runs` / `thread_messages`)
  - `0006` — `thread_messages` table + RLS + Realtime publication (chat timeline per thread)
  - `0007` — Extra `runs` columns for execution (`repo_url`, `logs`, `preview_url`, etc.)

### To apply migrations
```bash
supabase start          # start local Supabase
supabase db push        # apply migrations
# set env vars in .env.local then:
pnpm dev
```

---

## Phase 2 — Core Execution ✅ Complete

Runs live **inside threads**: `thread_messages` = chat timeline (user / agent / system); `runs` = agent jobs; `run_events` = append-only technical stream. **Thread-first** route: `/threads/[threadId]`; **run tools** (sandbox, terminal, files, PR): `/runs/[runId]`. Polling on the run page replaced with **Supabase Realtime** on `runs` + `run_events`.

### Done
- **`sandbox-agent`** npm package; **`lib/sandbox/agent-client.ts`** — connect to daemon on `:2468`, `createSession` / `prompt`, map events → `RunLogger` / `run_events`
- **`lib/sandbox/creation.ts`** — `runId`, `startSandboxAgentDaemon` after clone; **`lib/sandbox/execute-run.ts`** — credential resolve → sandbox → agent session → push / status; Slack notify hooks on completion/failure
- **`lib/credentials/resolve.ts`** — user `user_credentials` + env fallbacks; **`lib/sandbox/config.ts`** — env validation per agent (incl. Cursor)
- **`lib/errors/codes.ts`** — structured error codes
- **`app/api/runs/`** — POST (creates/reuses thread, `thread_messages` + `runs`, `after(executeRun)`); GET list; all former **`app/api/tasks/[taskId]/`** behaviors under **`app/api/runs/[runId]/`** (terminal, files, continue, messages → `thread_messages` where appropriate)
- **Removed** `app/api/tasks/`, legacy **`lib/sandbox/agents/*.ts`** CLI implementations (stubs/types via **`lib/sandbox/agents/index.ts`**)
- **`lib/hooks/use-run.ts`** — Realtime on `runs` + `run_events`; **`lib/hooks/use-task.ts`** — thin alias over `useRun`
- **`lib/hooks/use-thread-messages.ts`**, **`use-thread-runs.ts`** — Realtime for thread page
- **`app/threads/[threadId]/`**, **`components/thread-page-client.tsx`**, **`app/api/threads/[threadId]/route.ts`**, **`lib/threads/server.ts`**
- **`lib/runs/map-run-to-api.ts`** — DB row → UI shape; **`lib/runs/logs-from-events.ts`** — merge `run_events` into run `logs` for existing log UI
- **Sandbox Agent agents in UI** (see **`docs/sandbox-agent-agents.md`**): `claude`, `codex`, `cursor`, `opencode` — **`components/task-form.tsx`** restricted list + models
- Home / multi-repo flows navigate to **`/threads/{threadId}`** when API returns `threadId`; sidebar links prefer thread when `threadId` present

### Deferred / differs from early checklist
- **`lib/db/schema.ts`** — **kept** as Zod + **`Task`**-shaped UI DTO (camelCase) used across components; not deleted until a dedicated rename to `Run` / generated types is scheduled
- No separate **`run-page-client.tsx`** rename — **`components/task-page-client.tsx`** still drives **`/runs/[runId]`** with `useRun` + Realtime
- **Phase 4** review runs / screenshots not wired into execute path yet

---

## Phase 3 — Slack Integration ✅ Complete (MVP)

Uses **`@slack/web-api`** and Slack **Events API** + **OAuth v2** (not Vercel Chat SDK / `@vercel/chat`). Bot tokens from OAuth are stored encrypted on **`workspace_integrations`** (not a static `SLACK_BOT_TOKEN` in env).

### Done
- **`app/api/slack/events/route.ts`** — signature verify (`SLACK_SIGNING_SECRET`), URL challenge, `app_mention` → **`lib/slack/process-mention.ts`** (upsert `threads` / `thread_messages` / `run`, `executeRun`; ack fast + `after()` work)
- **`app/api/slack/oauth/install/route.ts`** + **`callback/route.ts`** — OAuth; encrypted **`slack_bot_token`** (+ optional encrypted signing secret) in **`workspace_integrations`**; **`slack_workspace_mappings`** (`slack_team_id` → `workspace_id`)
- **`app/api/slack/actions/route.ts`** — interactivity; **`stop_run`** button handling
- **`lib/slack/client.ts`**, **`workspace-token.ts`**, **`verify-request.ts`**, **`notify.ts`**, **`blocks.ts`** — Block Kit for in-progress + completion/failure; completion includes PR/preview links when present
- **`SLACK_DEFAULT_REPO_URL`** — optional env for default repo on Slack-triggered runs (documented in **`.env.example`**)
- Thread continuation: same Slack thread key → same **`threads`** row; new mention → new **`run`** on that thread (see **`process-mention`**)

### Not done (Phase 4+)
- Throttled streaming of every `run_event` to Slack (only key lifecycle posts today)
- Rich review cards with screenshots; **`approve/reject`** via Slack beyond minimal **`stop_run`**

---

## Phase 4 — Review Artifacts ⬜ Not Started

Screenshots via `agent-browser`, uploaded to Supabase Storage, surfaced in Slack and web UI.

- [ ] Install `agent-browser` (confirm npm package vs. CLI)
- [ ] **`lib/sandbox/screenshot.ts`** — run `agent-browser screenshot` in sandbox, read output files
- [ ] **`lib/storage/run-artifacts.ts`** — upload screenshots to Supabase Storage, return signed URLs
- [ ] **`app/api/storage/[...path]/route.ts`** — proxy endpoint for Slack image blocks (validates workspace membership → signed URL redirect)
- [ ] Extend `lib/sandbox/execute-run.ts` — poll Vercel deploy → capture screenshots → generate AI summary → insert `review_runs`
- [ ] **`app/api/runs/[runId]/review/route.ts`** — GET review run, PATCH approve/reject
- [ ] **`components/review-run-panel.tsx`** — before/after screenshots, diff viewer, approve/reject controls

---

## Phase 5 — GitHub App ⬜ Not Started

Org-level GitHub App installation replaces per-user tokens. Required for proper multi-tenant repo access.

- [ ] Install `@octokit/auth-app`
- [ ] Register GitHub App (permissions: `contents:write`, `pull_requests:write`, `checks:read`, `metadata:read`)
- [ ] **`app/api/github/app/install/route.ts`** — redirect to GitHub App installation URL
- [ ] **`app/api/github/app/callback/route.ts`** — receive `installation_id`, upsert `github_app_installations`
- [ ] **`app/api/github/app/repos/route.ts`** — list repos accessible to the workspace installation
- [ ] **`app/api/github/webhook/route.ts`** — handle `pull_request.closed` (merged), `check_run.completed`
- [ ] **`lib/github/app-auth.ts`** — `getInstallationToken(workspaceId)` with in-memory TTL cache
- [ ] Update `lib/github/client.ts` `createPullRequest()` to use app token
- [ ] Finalize `lib/credentials/resolve.ts` — personal GitHub token → app installation token → error
- [ ] **`app/[workspaceSlug]/settings/github/page.tsx`** — installation status + "Install GitHub App" button

---

## Phase 6 — Web UI ⬜ Not Started

Multi-tenant layout, workspace setup, project management, run history, review dashboard.

- [ ] **`app/[workspaceSlug]/layout.tsx`** — workspace layout server component (validates membership via RLS)
- [ ] **`components/workspace-sidebar.tsx`** — workspace switcher, projects, new run, settings, user avatar
- [ ] **`app/[workspaceSlug]/runs/page.tsx`** — workspace run history
- [ ] **`app/[workspaceSlug]/reviews/page.tsx`** — pending review runs (primary surface for non-technical users)
- [ ] **`app/[workspaceSlug]/projects/new/page.tsx`** — multi-step project creation (GitHub repo → Vercel → base branch)
- [ ] **`components/new-run-composer.tsx`** — replaces `home-page-content.tsx`; project picker, intent selector, submits to `POST /api/runs`
- [ ] **`components/runs-list-client.tsx`** — replaces `tasks-list-client.tsx` with Supabase Realtime subscription
- [ ] **`app/[workspaceSlug]/settings/credentials/page.tsx`** — per-user + workspace AI key management
- [ ] **`app/[workspaceSlug]/settings/slack/page.tsx`** — Slack integration status + "Add to Slack"
- [ ] **`app/[workspaceSlug]/settings/members/page.tsx`** — member list, invite, role management
- [ ] URL structure: `/` → `/dashboard` → `/{workspaceSlug}/runs`
- [x] Delete old `app/api/tasks/` routes — **done** (replaced by `app/api/runs/`)

---

## Environment Variables

| Variable | Status | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ⬜ Set in .env.local | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ⬜ Set in .env.local | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ⬜ Set in .env.local | Service role key (server-only) |
| `ENCRYPTION_KEY` | ⬜ Set in .env.local | AES-256 key for API key + Slack token encryption at rest |
| `NEXT_PUBLIC_APP_URL` | ⬜ Set in .env.local | App base URL (Slack OAuth redirect) |
| `SANDBOX_VERCEL_TOKEN` | ⬜ Required for runs | Vercel sandbox API token |
| `SANDBOX_VERCEL_TEAM_ID` | ⬜ Required for runs | Vercel team ID |
| `SANDBOX_VERCEL_PROJECT_ID` | ⬜ Required for runs | Vercel project ID |
| `AI_GATEWAY_API_KEY` | ⬜ Optional | Vercel AI Gateway (utilities + some agents) |
| `ANTHROPIC_API_KEY` | ⬜ Optional | System fallback for Claude / opencode |
| `OPENAI_API_KEY` | ⬜ Optional | System fallback for Codex / opencode |
| `CURSOR_API_KEY` | ⬜ Optional | System fallback for Sandbox Agent `cursor` (must also reach sandbox runtime) |
| `SLACK_SIGNING_SECRET` | ⬜ For Slack | Events API + Interactivity verification |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | ⬜ For Slack | Workspace OAuth install |
| `SLACK_DEFAULT_REPO_URL` | ⬜ Optional | Default GitHub repo URL for Slack `@mention` runs |
| `NEXT_PUBLIC_SLACK_APP_ID` | ⬜ Optional | Deep links |
| `GITHUB_APP_ID` | ⬜ Phase 5 | GitHub App numeric ID |
| `GITHUB_APP_PRIVATE_KEY` | ⬜ Phase 5 | Base64-encoded PEM key |
| `GITHUB_WEBHOOK_SECRET` | ⬜ Phase 5 | GitHub webhook verification |
