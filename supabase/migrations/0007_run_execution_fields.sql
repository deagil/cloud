-- Fields needed for web execution parity (formerly on tasks).

alter table public.runs
  add column if not exists repo_url text,
  add column if not exists max_duration integer not null default 300,
  add column if not exists keep_alive boolean not null default false,
  add column if not exists install_dependencies boolean not null default false,
  add column if not exists enable_browser boolean not null default false,
  add column if not exists mcp_server_ids jsonb,
  add column if not exists logs jsonb,
  add column if not exists preview_url text;
