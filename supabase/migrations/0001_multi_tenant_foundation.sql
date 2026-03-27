-- Migration: Multi-tenant foundation schema
-- Creates all core tables for the workspace/project/thread/run domain model.
-- Auth is handled by Supabase built-in auth.users table.

-- ─────────────────────────────────────────────
-- PROFILES (mirrors auth.users metadata)
-- ─────────────────────────────────────────────
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  name text,
  email text,
  avatar_url text,
  created_at timestamptz default now() not null
);

-- Auto-create profile row on new user sign-up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, name, email, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────
-- WORKSPACES
-- ─────────────────────────────────────────────
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_id uuid references profiles on delete restrict not null,
  created_at timestamptz default now() not null
);

-- ─────────────────────────────────────────────
-- WORKSPACE MEMBERS
-- ─────────────────────────────────────────────
create table if not exists workspace_members (
  workspace_id uuid references workspaces on delete cascade not null,
  user_id uuid references profiles on delete cascade not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz default now() not null,
  primary key (workspace_id, user_id)
);

-- ─────────────────────────────────────────────
-- WORKSPACE INTEGRATIONS
-- ─────────────────────────────────────────────
create table if not exists workspace_integrations (
  workspace_id uuid references workspaces on delete cascade primary key,
  github_app_installation_id text,
  vercel_team_id text,
  slack_team_id text,
  slack_bot_token text,        -- encrypted via app-level AES-256
  slack_signing_secret text,   -- encrypted
  updated_at timestamptz default now() not null
);

-- ─────────────────────────────────────────────
-- CREDENTIALS (AI API keys)
-- ─────────────────────────────────────────────
create table if not exists workspace_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces on delete cascade not null,
  provider text not null,  -- 'anthropic' | 'openai' | 'cursor'
  encrypted_secret text not null,
  unique (workspace_id, provider)
);

create table if not exists user_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles on delete cascade not null,
  provider text not null,
  encrypted_secret text not null,
  unique (user_id, provider)
);

-- ─────────────────────────────────────────────
-- PROJECTS
-- ─────────────────────────────────────────────
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces on delete cascade not null,
  name text not null,
  slug text not null,
  github_repo_url text,
  github_owner text,
  github_repo text,
  vercel_project_id text,
  base_branch text not null default 'main',
  sandbox_snapshot_id text,
  created_by uuid references profiles on delete set null,
  created_at timestamptz default now() not null,
  unique (workspace_id, slug)
);

-- ─────────────────────────────────────────────
-- THREADS (conversation containers)
-- ─────────────────────────────────────────────
create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete set null,
  workspace_id uuid references workspaces on delete cascade not null,
  title text,
  source text not null check (source in ('slack', 'web')),
  slack_channel_id text,
  slack_thread_ts text,
  slack_team_id text,
  created_by uuid references profiles on delete set null,
  created_at timestamptz default now() not null
);

-- Slack threads are unique per channel + thread timestamp
create unique index if not exists threads_slack_unique
  on threads (slack_channel_id, slack_thread_ts)
  where source = 'slack' and slack_channel_id is not null and slack_thread_ts is not null;

-- ─────────────────────────────────────────────
-- RUNS (one agent execution per message)
-- ─────────────────────────────────────────────
create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads on delete set null,
  project_id uuid references projects on delete set null,
  workspace_id uuid references workspaces on delete cascade not null,
  created_by uuid references profiles on delete set null,
  prompt text not null,
  title text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'error', 'stopped')),
  intent text check (intent in ('build', 'debug', 'plan', 'ask')),
  selected_agent text not null default 'claude',
  selected_model text,
  sandbox_id text,
  sandbox_url text,
  agent_session_id text,
  branch_name text,
  pr_url text,
  pr_number integer,
  pr_status text check (pr_status in ('open', 'closed', 'merged')),
  pr_merge_commit_sha text,
  progress integer not null default 0,
  error text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  completed_at timestamptz,
  deleted_at timestamptz
);

create index if not exists runs_workspace_id_created_at on runs (workspace_id, created_at desc);
create index if not exists runs_thread_id on runs (thread_id);
create index if not exists runs_project_id on runs (project_id);

-- ─────────────────────────────────────────────
-- RUN EVENTS (append-only audit log)
-- ─────────────────────────────────────────────
create table if not exists run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs on delete cascade not null,
  type text not null,
  -- 'log.info' | 'log.error' | 'log.command' | 'log.success' |
  -- 'progress' | 'status_changed' | 'agent_output' | 'review_ready'
  payload jsonb,
  created_at timestamptz default now() not null
);

create index if not exists run_events_run_id_created_at on run_events (run_id, created_at asc);

-- ─────────────────────────────────────────────
-- RUN MESSAGES (conversation history)
-- ─────────────────────────────────────────────
create table if not exists run_messages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs on delete cascade not null,
  role text not null check (role in ('user', 'agent')),
  content text not null,
  created_at timestamptz default now() not null
);

create index if not exists run_messages_run_id on run_messages (run_id, created_at asc);

-- ─────────────────────────────────────────────
-- REVIEW RUNS (review artifacts + approval state)
-- ─────────────────────────────────────────────
create table if not exists review_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs on delete cascade unique not null,
  branch text,
  preview_url text,
  summary text,
  screenshot_urls jsonb not null default '[]'::jsonb,
  check_results jsonb,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references profiles on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now() not null
);

-- ─────────────────────────────────────────────
-- GITHUB APP INSTALLATIONS
-- ─────────────────────────────────────────────
create table if not exists github_app_installations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces on delete cascade not null,
  installation_id text not null unique,
  account_login text,
  account_type text,
  created_at timestamptz default now() not null
);

-- ─────────────────────────────────────────────
-- SLACK WORKSPACE MAPPINGS
-- ─────────────────────────────────────────────
create table if not exists slack_workspace_mappings (
  slack_team_id text primary key,
  workspace_id uuid references workspaces on delete cascade not null
);

-- ─────────────────────────────────────────────
-- MCP CONNECTORS
-- ─────────────────────────────────────────────
create table if not exists connectors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces on delete cascade not null,
  created_by uuid references profiles on delete set null,
  name text not null,
  type text not null check (type in ('local', 'remote')),
  base_url text,
  command text,
  env text,  -- AES-256 encrypted JSON of env vars
  status text not null default 'connected' check (status in ('connected', 'disconnected')),
  created_at timestamptz default now() not null
);
