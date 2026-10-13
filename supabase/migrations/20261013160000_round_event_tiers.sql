-- Tournament tagging for the Talent Index. Coaches mark a player's round as an event (club comp up to
-- national), with the course rating and slope so a score differential can be worked out.
-- Players can't set or change these fields themselves; only coaches, through set_round_event().

alter table public.rounds
  add column if not exists event_tier text
    check (event_tier is null or event_tier in ('club_comp', 'regional', 'state', 'national')),
  add column if not exists event_name text check (event_name is null or char_length(event_name) <= 120),
  add column if not exists course_rating numeric(4, 1) check (course_rating is null or course_rating between 50 and 90),
  add column if not exists slope_rating smallint check (slope_rating is null or slope_rating between 55 and 155),
  add column if not exists event_set_by uuid,
  add column if not exists event_set_at timestamptz;

comment on column public.rounds.event_tier is
  'Set by coaches: club_comp (Stonecutters comps), regional, state (incl. JNJG), national. Null = social round (not counted).';

create or replace function public.rounds_protect_event_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_coach() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.event_tier := null;
    new.event_name := null;
    new.course_rating := null;
    new.slope_rating := null;
    new.event_set_by := null;
    new.event_set_at := null;
  else
    new.event_tier := old.event_tier;
    new.event_name := old.event_name;
    new.course_rating := old.course_rating;
    new.slope_rating := old.slope_rating;
    new.event_set_by := old.event_set_by;
    new.event_set_at := old.event_set_at;
  end if;
  return new;
end;
$$;

drop trigger if exists rounds_protect_event_fields on public.rounds;
create trigger rounds_protect_event_fields
  before insert or update on public.rounds
  for each row execute function public.rounds_protect_event_fields();

create or replace function public.set_round_event(
  p_round text,
  p_tier text,
  p_event_name text,
  p_course_rating numeric,
  p_slope_rating integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_coach() then
    raise exception 'Only coaches can tag tournament rounds';
  end if;
  update public.rounds
  set event_tier = nullif(btrim(coalesce(p_tier, '')), ''),
      event_name = nullif(btrim(coalesce(p_event_name, '')), ''),
      course_rating = p_course_rating,
      slope_rating = p_slope_rating,
      event_set_by = auth.uid(),
      event_set_at = now()
  where id::text = p_round;
  if not found then
    raise exception 'Round not found';
  end if;
end;
$$;

revoke all on function public.set_round_event(text, text, text, numeric, integer) from public, anon;
grant execute on function public.set_round_event(text, text, text, numeric, integer) to authenticated;

notify pgrst, 'reload schema';
