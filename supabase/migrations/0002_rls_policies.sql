-- Migration: Row Level Security policies
-- Enables RLS on all tables and defines access rules.
-- Service role key bypasses all RLS for server-side operations.

-- ─────────────────────────────────────────────
-- Helper: check workspace membership
-- ─────────────────────────────────────────────
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
stable security definer
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws_id
      and user_id = auth.uid()
  )
$$;

create or replace function public.is_workspace_admin(ws_id uuid)
returns boolean
language sql
stable security definer
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  )
$$;

-- ─────────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────────
alter table profiles enable row level security;

create policy "Profiles are readable by authenticated users"
  on profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid());

-- ─────────────────────────────────────────────
-- WORKSPACES
-- ─────────────────────────────────────────────
alter table workspaces enable row level security;

create policy "Workspaces readable by members"
  on workspaces for select
  to authenticated
  using (is_workspace_member(id));

create policy "Workspace owners can update"
  on workspaces for update
  to authenticated
  using (owner_id = auth.uid());

create policy "Authenticated users can create workspaces"
  on workspaces for insert
  to authenticated
  with check (owner_id = auth.uid());

-- ─────────────────────────────────────────────
-- WORKSPACE MEMBERS
-- ─────────────────────────────────────────────
alter table workspace_members enable row level security;

create policy "Members readable by workspace members"
  on workspace_members for select
  to authenticated
  using (is_workspace_member(workspace_id));

create policy "Admins can insert members"
  on workspace_members for insert
  to authenticated
  with check (is_workspace_admin(workspace_id) or user_id = auth.uid());

create policy "Admins can remove members"
  on workspace_members for delete
  to authenticated
  using (is_workspace_admin(workspace_id) or user_id = auth.uid());

-- ─────────────────────────────────────────────
-- WORKSPACE INTEGRATIONS
-- ─────────────────────────────────────────────
alter table workspace_integrations enable row level security;

create policy "Integrations readable by workspace members"
  on workspace_integrations for select
  to authenticated
  using (is_workspace_member(workspace_id));

create policy "Admins can manage integrations"
  on workspace_integrations for all
  to authenticated
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

-- ─────────────────────────────────────────────
-- WORKSPACE CREDENTIALS
-- ─────────────────────────────────────────────
alter table workspace_credentials enable row level security;

-- Only admins can view/manage workspace credentials (org-level keys are sensitive)
create policy "Admins can manage workspace credentials"
  on workspace_credentials for all
  to authenticated
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

-- ─────────────────────────────────────────────
-- USER CREDENTIALS
-- ─────────────────────────────────────────────
alter table user_credentials enable row level security;

create policy "Users can manage their own credentials"
  on user_credentials for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- PROJECTS
-- ─────────────────────────────────────────────
alter table projects enable row level security;

create policy "Projects readable by workspace members"
  on projects for select
  to authenticated
  using (is_workspace_member(workspace_id));

create policy "Admins can manage projects"
  on projects for all
  to authenticated
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

create policy "Members can create projects"
  on projects for insert
  to authenticated
  with check (is_workspace_member(workspace_id));

-- ─────────────────────────────────────────────
-- THREADS
-- ─────────────────────────────────────────────
alter table threads enable row level security;

create policy "Threads readable by workspace members"
  on threads for select
  to authenticated
  using (is_workspace_member(workspace_id));

create policy "Members can create threads"
  on threads for insert
  to authenticated
  with check (is_workspace_member(workspace_id));

-- ─────────────────────────────────────────────
-- RUNS
-- ─────────────────────────────────────────────
alter table runs enable row level security;

create policy "Runs readable by workspace members"
  on runs for select
  to authenticated
  using (is_workspace_member(workspace_id));

create policy "Members can create runs"
  on runs for insert
  to authenticated
  with check (is_workspace_member(workspace_id));

create policy "Members can update their own runs; admins can update any"
  on runs for update
  to authenticated
  using (
    (created_by = auth.uid() and status in ('pending', 'processing'))
    or is_workspace_admin(workspace_id)
  );

-- ─────────────────────────────────────────────
-- RUN EVENTS (append-only — no user writes)
-- ─────────────────────────────────────────────
alter table run_events enable row level security;

create policy "Run events readable by workspace members"
  on run_events for select
  to authenticated
  using (
    exists (
      select 1 from runs r
      where r.id = run_id
        and is_workspace_member(r.workspace_id)
    )
  );

-- Inserts only via service role (background execution). No user INSERT policy.

-- ─────────────────────────────────────────────
-- RUN MESSAGES
-- ─────────────────────────────────────────────
alter table run_messages enable row level security;

create policy "Run messages readable by workspace members"
  on run_messages for select
  to authenticated
  using (
    exists (
      select 1 from runs r
      where r.id = run_id
        and is_workspace_member(r.workspace_id)
    )
  );

create policy "Members can insert messages"
  on run_messages for insert
  to authenticated
  with check (
    exists (
      select 1 from runs r
      where r.id = run_id
        and is_workspace_member(r.workspace_id)
    )
  );

-- ─────────────────────────────────────────────
-- REVIEW RUNS
-- ─────────────────────────────────────────────
alter table review_runs enable row level security;

create policy "Review runs readable by workspace members"
  on review_runs for select
  to authenticated
  using (
    exists (
      select 1 from runs r
      where r.id = run_id
        and is_workspace_member(r.workspace_id)
    )
  );

create policy "Members can approve/reject reviews"
  on review_runs for update
  to authenticated
  using (
    exists (
      select 1 from runs r
      where r.id = run_id
        and is_workspace_member(r.workspace_id)
    )
  );

-- ─────────────────────────────────────────────
-- GITHUB APP INSTALLATIONS
-- ─────────────────────────────────────────────
alter table github_app_installations enable row level security;

create policy "GitHub installations readable by workspace members"
  on github_app_installations for select
  to authenticated
  using (is_workspace_member(workspace_id));

create policy "Admins can manage GitHub installations"
  on github_app_installations for all
  to authenticated
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

-- ─────────────────────────────────────────────
-- SLACK WORKSPACE MAPPINGS
-- ─────────────────────────────────────────────
alter table slack_workspace_mappings enable row level security;

create policy "Slack mappings readable by workspace members"
  on slack_workspace_mappings for select
  to authenticated
  using (is_workspace_member(workspace_id));

-- Inserts only via service role (Slack OAuth callback).

-- ─────────────────────────────────────────────
-- CONNECTORS
-- ─────────────────────────────────────────────
alter table connectors enable row level security;

create policy "Connectors readable by workspace members"
  on connectors for select
  to authenticated
  using (is_workspace_member(workspace_id));

create policy "Members can manage connectors"
  on connectors for all
  to authenticated
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));
