-- Thread-scoped chat timeline (humans + agent-facing messages).
-- run_id optional: links a message to the run that produced it.

create table if not exists public.thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  author_user_id uuid references public.profiles (id) on delete set null,
  role text not null check (role in ('user', 'agent', 'system')),
  content text not null,
  run_id uuid references public.runs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists thread_messages_thread_id_created_at
  on public.thread_messages (thread_id, created_at asc);

create index if not exists thread_messages_run_id
  on public.thread_messages (run_id)
  where run_id is not null;

alter table public.thread_messages enable row level security;

create policy "Thread messages readable by workspace members"
  on public.thread_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.threads t
      where t.id = thread_id
        and public.is_workspace_member(t.workspace_id)
    )
  );

create policy "Members can insert thread messages"
  on public.thread_messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.threads t
      where t.id = thread_id
        and public.is_workspace_member(t.workspace_id)
    )
  );

-- Realtime for live thread UI
alter publication supabase_realtime add table public.thread_messages;
