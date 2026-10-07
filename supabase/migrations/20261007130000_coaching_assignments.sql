-- Drills and library lessons a coach assigns to a player (during a lesson or swing review).
--   student_id: the player's user id, or the coaching_spaces id while their invite is pending
--               (same key as coaching_posts; moved onto the player when they join).
--   kind/item_id: 'drill' + stable drill key (drill_id, else id), or 'lesson' + library lesson id.
-- Ticked off by the player, or automatically when they log that drill or finish that lesson.

create table if not exists public.coaching_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  coach_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('drill', 'lesson')),
  item_id text not null check (char_length(item_id) between 1 and 200),
  title text not null check (char_length(title) between 1 and 200),
  note text check (note is null or char_length(note) <= 1000),
  post_id uuid references public.coaching_posts (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_auto boolean not null default false
);

create index if not exists coaching_assignments_student_idx
  on public.coaching_assignments (student_id, created_at desc);

alter table public.coaching_assignments enable row level security;

drop policy if exists "coaching_assignments_select" on public.coaching_assignments;
create policy "coaching_assignments_select"
  on public.coaching_assignments for select to authenticated
  using (student_id = auth.uid() or public.is_coach());

drop policy if exists "coaching_assignments_insert" on public.coaching_assignments;
create policy "coaching_assignments_insert"
  on public.coaching_assignments for insert to authenticated
  with check (
    coach_id = auth.uid()
    and public.is_coach()
    and public.coaching_space_key_exists(student_id)
  );

drop policy if exists "coaching_assignments_update" on public.coaching_assignments;
create policy "coaching_assignments_update"
  on public.coaching_assignments for update to authenticated
  using (student_id = auth.uid() or public.is_coach())
  with check (student_id = auth.uid() or public.is_coach());

drop policy if exists "coaching_assignments_delete" on public.coaching_assignments;
create policy "coaching_assignments_delete"
  on public.coaching_assignments for delete to authenticated
  using (public.is_coach());

-- Players (and coaches) may only change completion; everything else is fixed once assigned.
revoke update on public.coaching_assignments from authenticated;
grant select, insert, delete on public.coaching_assignments to authenticated;
grant update (completed_at, completed_auto) on public.coaching_assignments to authenticated;

-- When an invite is accepted, move assignments from the space id onto the player.
create or replace function public.coaching_assignments_follow_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.student_id is null and new.student_id is not null then
      update public.coaching_assignments set student_id = new.student_id where student_id = new.id;
    end if;
    return new;
  end if;
  if tg_table_name = 'coaching_spaces' and old.student_id is not null then
    return old;
  end if;
  delete from public.coaching_assignments where student_id = old.id;
  return old;
end;
$$;

drop trigger if exists coaching_assignments_space_joined on public.coaching_spaces;
create trigger coaching_assignments_space_joined
  after update of student_id on public.coaching_spaces
  for each row execute function public.coaching_assignments_follow_space();

drop trigger if exists coaching_assignments_space_deleted on public.coaching_spaces;
create trigger coaching_assignments_space_deleted
  after delete on public.coaching_spaces
  for each row execute function public.coaching_assignments_follow_space();

drop trigger if exists coaching_assignments_profile_deleted on public.profiles;
create trigger coaching_assignments_profile_deleted
  after delete on public.profiles
  for each row execute function public.coaching_assignments_follow_space();

-- Auto-complete: args are (kind, column holding the item id). Never blocks the player's own insert.
create or replace function public.coaching_assignments_autocomplete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := to_jsonb(new);
begin
  update public.coaching_assignments
     set completed_at = now(), completed_auto = true
   where student_id = (r ->> 'user_id')::uuid
     and kind = tg_argv[0]
     and item_id = r ->> tg_argv[1]
     and completed_at is null;
  return new;
exception when others then
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'drill_score_logs' and column_name = 'drill_key') then
    drop trigger if exists coaching_assignments_drill_score on public.drill_score_logs;
    create trigger coaching_assignments_drill_score
      after insert on public.drill_score_logs
      for each row execute function public.coaching_assignments_autocomplete('drill', 'drill_key');
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'practice' and column_name = 'type') then
    drop trigger if exists coaching_assignments_practice on public.practice;
    create trigger coaching_assignments_practice
      after insert on public.practice
      for each row execute function public.coaching_assignments_autocomplete('drill', 'type');
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'library_lesson_completions' and column_name = 'lesson_id') then
    drop trigger if exists coaching_assignments_lesson on public.library_lesson_completions;
    create trigger coaching_assignments_lesson
      after insert on public.library_lesson_completions
      for each row execute function public.coaching_assignments_autocomplete('lesson', 'lesson_id');
  end if;
end $$;

notify pgrst, 'reload schema';
