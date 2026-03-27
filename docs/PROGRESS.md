# Implementation Progress

Transforming the `coding-agent-template` into a Slack-native multi-tenant coding agent control plane.
Full plan: `/Users/dylangilchrist/.claude/plans/curried-herding-penguin.md`

---

## Phase 1 — Foundation ✅ Complete

Supabase Auth + multi-tenant schema. No user-facing regressions — old task routes still compile via compatibility shim.

### Done
- **Dependencies** — removed `drizzle-orm`, `drizzle-kit`, `jose`, `arctic`, `@neondatabase/serverless`, `postgres`; added `@supabase/supabase-js`, `@supabase/ssr`
- **`lib/supabase/server.ts`** — cookie-based server client (respects RLS)
- **`lib/supabase/client.ts`** — browser client
- **`lib/supabase/admin.ts`** — service role client for background jobs/webhooks (bypasses RLS)
- **`middleware.ts`** — Supabase session refresh + route protection
- **`lib/session/get-server-session.ts`** — compatibility shim over Supabase Auth; all 33 existing task routes continue to work unchanged
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

### To apply migrations
```bash
supabase start          # start local Supabase
supabase db push        # apply migrations
# set env vars in .env.local then:
pnpm dev
```

---

## Phase 2 — Core Execution ⬜ Not Started

Replace 6 CLI adapters with `sandbox-agent`. Migrate task execution to `runs` domain model. Replace polling with Supabase Realtime.

- [ ] Install `sandbox-agent` npm package
- [ ] **`lib/sandbox/agent-client.ts`** — HTTP client for sandbox-agent daemon at `:2468` (replaces all of `lib/sandbox/agents/*.ts`)
- [ ] **`lib/sandbox/creation.ts`** — change `taskId` → `runId`; add sandbox-agent daemon startup after git clone
- [ ] **`lib/sandbox/execute-run.ts`** — new async execution loop: credential resolve → sandbox create → agent session → stream events → git push → PR → review run
- [ ] **`lib/credentials/resolve.ts`** — credential resolution chain: user key → workspace key → env var fallback → structured error
- [ ] **`lib/errors/codes.ts`** — structured error codes (`ai_credentials_required`, `github_credentials_required`, etc.)
- [ ] **`app/api/runs/route.ts`** — POST creates a run (replaces `app/api/tasks/route.ts` POST)
- [ ] **`app/api/runs/[runId]/route.ts`** — GET, PATCH (stop), DELETE
- [ ] Migrate all sub-routes from `app/api/tasks/[taskId]/` → `app/api/runs/[runId]/`
- [ ] Delete `lib/sandbox/agents/*.ts` (6 files, ~2500 lines)
- [ ] Delete `lib/db/schema.ts` (Drizzle schema — replaced by SQL migrations)
- [ ] **`lib/hooks/use-run.ts`** — Supabase Realtime subscriptions (replaces polling in `use-task.ts`)
- [ ] **`components/run-page-client.tsx`** — adapt task page to use `useRun()` + realtime events

---

## Phase 3 — Slack Integration ⬜ Not Started

Vercel Chat SDK for Slack. @mentions create runs, lifecycle posts back to thread, review cards with approve/reject.

- [ ] Install Vercel Chat SDK (`@vercel/chat` — confirm package name)
- [ ] **`app/api/chat/slack/route.ts`** — webhook handler: verify signature → resolve workspace → create thread/run → ack → async execute
- [ ] **Slack trigger logic** — @mention in groups; auto-reply if bot is only non-human in channel/DM
- [ ] **`app/api/slack/oauth/install/route.ts`** + **`callback/route.ts`** — workspace Slack installation flow
- [ ] **`app/api/slack/actions/route.ts`** — interactive callbacks (approve/reject/stop buttons)
- [ ] **`lib/slack/client.ts`** — Chat SDK wrapper initialised with per-workspace bot token
- [ ] **`lib/slack/notify.ts`** — post run updates, throttled tool call updates, review card on completion
- [ ] **`lib/slack/blocks.ts`** — Block Kit builders: running card, review card with screenshots
- [ ] Thread continuation logic — new run vs. queued message vs. send to live agent session

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
- [ ] Delete old `app/api/tasks/` routes once UI is fully migrated

---

## Environment Variables

| Variable | Status | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ⬜ Set in .env.local | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ⬜ Set in .env.local | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ⬜ Set in .env.local | Service role key (server-only) |
| `ENCRYPTION_KEY` | ⬜ Set in .env.local | AES-256 key for API key encryption |
| `NEXT_PUBLIC_APP_URL` | ⬜ Set in .env.local | App base URL |
| `SANDBOX_VERCEL_TOKEN` | ⬜ Carry over | Vercel sandbox API token |
| `SANDBOX_VERCEL_TEAM_ID` | ⬜ Carry over | Vercel team ID |
| `SANDBOX_VERCEL_PROJECT_ID` | ⬜ Carry over | Vercel project ID |
| `AI_GATEWAY_API_KEY` | ⬜ Optional | Vercel AI Gateway for utility calls |
| `ANTHROPIC_API_KEY` | ⬜ Optional | System-level fallback |
| `SLACK_BOT_TOKEN` | ⬜ Phase 3 | Slack bot token |
| `SLACK_SIGNING_SECRET` | ⬜ Phase 3 | Slack request verification |
| `SLACK_CLIENT_ID/SECRET` | ⬜ Phase 3 | Slack workspace OAuth |
| `GITHUB_APP_ID` | ⬜ Phase 5 | GitHub App numeric ID |
| `GITHUB_APP_PRIVATE_KEY` | ⬜ Phase 5 | Base64-encoded PEM key |
| `GITHUB_WEBHOOK_SECRET` | ⬜ Phase 5 | GitHub webhook verification |
