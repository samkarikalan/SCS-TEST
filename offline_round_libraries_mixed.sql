-- Allow shared offline round libraries for Mixed Doubles as well as Doubles.
alter table public.offline_round_libraries
  drop constraint if exists offline_round_libraries_game_type_check;

alter table public.offline_round_libraries
  add constraint offline_round_libraries_game_type_check
  check (game_type in ('doubles', 'mixed'));

drop policy if exists "offline libraries insert doubles" on public.offline_round_libraries;
drop policy if exists "offline libraries update doubles" on public.offline_round_libraries;

create policy "offline libraries insert supported games"
  on public.offline_round_libraries
  for insert
  with check (game_type in ('doubles', 'mixed'));

create policy "offline libraries update supported games"
  on public.offline_round_libraries
  for update
  using (game_type in ('doubles', 'mixed'))
  with check (game_type in ('doubles', 'mixed'));
