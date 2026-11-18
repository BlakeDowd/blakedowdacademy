-- Coach tags for Practice Finder: practice kind + suitable scoring band.
-- drill_key matches drill_scoring (official code or id, lower-cased).

create table if not exists public.drill_finder_tags (
  drill_key text primary key check (char_length(drill_key) between 1 and 80),
  practice_kinds text[] not null default '{}',
  score_bands text[] not null default '{}',
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint drill_finder_tags_kinds_ok check (
    practice_kinds <@ array['mechanics', 'skill', 'performance']::text[]
  ),
  constraint drill_finder_tags_bands_ok check (
    score_bands <@ array['100-plus', '90-100', '80-90', '70-80', 'below-par']::text[]
  )
);

comment on table public.drill_finder_tags is
  'Practice Finder tags per drill: mechanics/skill/performance and score bands.';

alter table public.drill_finder_tags enable row level security;

drop policy if exists "drill_finder_tags_select" on public.drill_finder_tags;
create policy "drill_finder_tags_select" on public.drill_finder_tags
  for select to anon, authenticated using (true);

drop policy if exists "drill_finder_tags_coach_insert" on public.drill_finder_tags;
create policy "drill_finder_tags_coach_insert" on public.drill_finder_tags
  for insert to authenticated with check (public.is_coach());

drop policy if exists "drill_finder_tags_coach_update" on public.drill_finder_tags;
create policy "drill_finder_tags_coach_update" on public.drill_finder_tags
  for update to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists "drill_finder_tags_coach_delete" on public.drill_finder_tags;
create policy "drill_finder_tags_coach_delete" on public.drill_finder_tags
  for delete to authenticated using (public.is_coach());

grant select on public.drill_finder_tags to anon, authenticated;
grant insert, update, delete on public.drill_finder_tags to authenticated;

notify pgrst, 'reload schema';
