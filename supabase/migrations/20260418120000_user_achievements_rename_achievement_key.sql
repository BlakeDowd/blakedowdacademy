-- If an older migration created achievement_id, rename it to achievement_key to match the app.
do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'user_achievements'
      and c.column_name = 'achievement_id'
  )
  and not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'user_achievements'
      and c.column_name = 'achievement_key'
  ) then
    alter table public.user_achievements rename column achievement_id to achievement_key;
  end if;
end $$;
