-- Shared club tournaments: local-first state with a resumable cloud snapshot.
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  format text not null check (format in ('knockout', 'group')),
  title text not null default 'Tournament',
  status text not null default 'draft' check (status in ('draft', 'live', 'completed', 'archived')),
  state_version integer not null default 1 check (state_version > 0),
  state jsonb not null default '{}'::jsonb,
  created_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournaments_club_status_updated_idx
  on public.tournaments (club_id, status, updated_at desc);
create index if not exists tournaments_club_format_updated_idx
  on public.tournaments (club_id, format, updated_at desc);

alter table public.tournaments enable row level security;

drop policy if exists tournaments_member_read on public.tournaments;
create policy tournaments_member_read on public.tournaments
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.club_id = tournaments.club_id
      and m.user_account_id = (select auth.uid())
  ));

drop policy if exists tournaments_member_insert on public.tournaments;
create policy tournaments_member_insert on public.tournaments
  for insert to authenticated
  with check (exists (
    select 1 from public.memberships m
    where m.club_id = tournaments.club_id
      and m.user_account_id = (select auth.uid())
  ));

drop policy if exists tournaments_member_update on public.tournaments;
create policy tournaments_member_update on public.tournaments
  for update to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.club_id = tournaments.club_id
      and m.user_account_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.club_id = tournaments.club_id
      and m.user_account_id = (select auth.uid())
  ));

grant select, insert, update on public.tournaments to authenticated;

-- Required on projects where new public tables are not auto-exposed.
comment on table public.tournaments is
  'Club-scoped Knockout and Group Tournament snapshots. State is versioned for safe future migrations.';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tournaments'
     ) then
    alter publication supabase_realtime add table public.tournaments;
  end if;
end $$;
