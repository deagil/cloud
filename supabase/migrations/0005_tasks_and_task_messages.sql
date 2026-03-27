-- Tables required by the Next.js app (lib/utils/task-logger, app/api/tasks/*).
-- These are separate from threads/runs: threads group work; runs are executions in the
-- multi-tenant model. The UI currently persists agent jobs in `tasks` + `task_messages`.
-- user_id references profiles(id) so Supabase Auth UUIDs satisfy the foreign key.

create table if not exists public.tasks (
  id text primary key not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  prompt text not null,
  title text,
  repo_url text,
  selected_agent text default 'claude',
  selected_model text,
  install_dependencies boolean not null default false,
  max_duration integer not null default 300,
  keep_alive boolean not null default false,
  enable_browser boolean not null default false,
  status text not null default 'pending',
  progress integer not null default 0,
  logs jsonb,
  error text,
  branch_name text,
  sandbox_id text,
  agent_session_id text,
  sandbox_url text,
  preview_url text,
  pr_url text,
  pr_number integer,
  pr_status text,
  pr_merge_commit_sha text,
  mcp_server_ids jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz,
  constraint tasks_status_check check (
    status in ('pending', 'processing', 'completed', 'error', 'stopped')
  ),
  constraint tasks_pr_status_check check (
    pr_status is null or pr_status in ('open', 'closed', 'merged')
  )
);

create table if not exists public.task_messages (
  id text primary key not null,
  task_id text not null references public.tasks (id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists tasks_user_id_deleted_created
  on public.tasks (user_id, created_at desc)
  where deleted_at is null;

create index if not exists task_messages_task_id_created
  on public.task_messages (task_id, created_at asc);
