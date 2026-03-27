-- Migration: Enable Supabase Realtime for live UI updates
-- These tables drive real-time subscriptions in the web UI.

-- Add tables to the realtime publication
-- (supabase_realtime publication is created by default in Supabase projects)

alter publication supabase_realtime add table runs;
alter publication supabase_realtime add table run_events;
alter publication supabase_realtime add table review_runs;
