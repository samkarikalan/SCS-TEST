-- Phase 1 shared Offline Round library
-- Scope: Doubles, exactly 2 courts, 8–20 players.

create table if not exists public.offline_round_libraries (
  signature text primary key,
  engine_version text not null,
  player_count integer not null check (player_count between 8 and 20),
  court_count integer not null check (court_count = 2),
  round_count integer not null check (round_count between 1 and 100),
  game_type text not null check (game_type = 'doubles'),
  algorithm text not null check (algorithm in ('standard', 'balanced')),
  random_order boolean not null,
  unique_pair_mode boolean not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offline_round_libraries_lookup_idx
  on public.offline_round_libraries
  (player_count, court_count, game_type, algorithm, random_order, unique_pair_mode, round_count);

alter table public.offline_round_libraries enable row level security;

-- The app reaches this table through the Cloudflare Worker. The Worker in the
-- current deployment uses SUPABASE_KEY, so these policies permit the REST role
-- used by that key. Payload validation and scope enforcement remain in Worker.
drop policy if exists "offline library read" on public.offline_round_libraries;
create policy "offline library read"
  on public.offline_round_libraries for select
  to anon, authenticated
  using (true);

drop policy if exists "offline library insert" on public.offline_round_libraries;
create policy "offline library insert"
  on public.offline_round_libraries for insert
  to anon, authenticated
  with check (
    player_count between 8 and 20
    and court_count = 2
    and game_type = 'doubles'
    and algorithm in ('standard', 'balanced')
    and round_count between 1 and 100
  );

drop policy if exists "offline library update" on public.offline_round_libraries;
create policy "offline library update"
  on public.offline_round_libraries for update
  to anon, authenticated
  using (true)
  with check (
    player_count between 8 and 20
    and court_count = 2
    and game_type = 'doubles'
    and algorithm in ('standard', 'balanced')
    and round_count between 1 and 100
  );

comment on table public.offline_round_libraries is
  'Anonymous, versioned Round Mode Offline templates cached by exact generator inputs.';
