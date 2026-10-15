-- Run once in Supabase SQL editor BEFORE enabling Team Tournament cloud saving.
-- Reuse existing public.tournaments RLS, indexes and worker API.
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_format_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_format_check
  CHECK (format IN ('knockout', 'group', 'team'));
