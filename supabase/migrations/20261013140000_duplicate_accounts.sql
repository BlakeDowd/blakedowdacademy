-- Duplicate accounts: stop people signing up twice with what is really the same email, and merge the ones that exist.
--
-- normalize_email: lower case, trimmed; Gmail addresses also ignore dots and "+anything" (Gmail delivers
--   tate.dimech+golf@gmail.com and tatedimech@gmail.com to the same inbox).
-- email_already_registered: used by the sign-up screen to warn before a second account is made.
-- duplicate_account_report: run in the SQL Editor to list accounts that share an email or a name.
-- merge_player_accounts(keep, drop): run in the SQL Editor. Moves everything from `drop` onto `keep`,
--   adds the XP together, then deletes the `drop` login. Not callable from the app.

create or replace function public.normalize_email(p_email text)
returns text
language sql
immutable
as $$
  select case
    when split_part(e, '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(e, '@', 1), '+', 1), '.', '') || '@gmail.com'
    else e
  end
  from (select lower(btrim(coalesce(p_email, ''))) as e) s;
$$;

create or replace function public.email_already_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users u
    where public.normalize_email(u.email) = public.normalize_email(p_email)
      and public.normalize_email(p_email) like '%_@_%'
  );
$$;

revoke all on function public.email_already_registered(text) from public;
grant execute on function public.email_already_registered(text) to anon, authenticated;

create or replace function public.duplicate_account_report()
returns table (
  match_on text,
  user_id uuid,
  email text,
  full_name text,
  total_xp numeric,
  signed_up timestamptz,
  last_sign_in timestamptz,
  rounds bigint,
  practice_entries bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with accounts as (
    select u.id, u.email::text as email, p.full_name, coalesce(p.total_xp, 0)::numeric as total_xp,
           u.created_at, u.last_sign_in_at,
           public.normalize_email(u.email) as norm_email,
           lower(btrim(coalesce(p.full_name, ''))) as norm_name
    from auth.users u
    left join public.profiles p on p.id = u.id
  ),
  dup as (
    select 'same email' as match_on, a.* from accounts a
    where a.norm_email <> ''
      and a.norm_email in (select norm_email from accounts group by norm_email having count(*) > 1)
    union all
    select 'same name', a.* from accounts a
    where a.norm_name <> ''
      and a.norm_name in (select norm_name from accounts group by norm_name having count(*) > 1)
  )
  select d.match_on, d.id, d.email, d.full_name, d.total_xp, d.created_at, d.last_sign_in_at,
         (select count(*) from public.rounds r where r.user_id = d.id),
         (select count(*) from public.practice pr where pr.user_id = d.id)
  from dup d
  order by d.match_on, d.norm_email, d.norm_name, d.created_at;
$$;

revoke all on function public.duplicate_account_report() from public, anon, authenticated;

create or replace function public.merge_player_accounts(p_keep uuid, p_drop uuid)
returns table (moved_from text, rows_moved bigint, rows_removed bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  r record;
  n bigint;
  d bigint;
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'Pick two different accounts';
  end if;
  if not exists (select 1 from auth.users where id = p_keep) then
    raise exception 'Account to keep (%) not found', p_keep;
  end if;
  if not exists (select 1 from auth.users where id = p_drop) then
    raise exception 'Account to merge away (%) not found', p_drop;
  end if;

  -- Every public column that holds a user id: foreign keys to users/profiles, plus the usual id column names
  -- (some tables dropped their foreign keys so they can also point at waiting coaching spaces).
  for c in
    select distinct t.tbl, t.col, t.typ
    from (
      select cl.relname::text as tbl, a.attname::text as col, format_type(a.atttypid, a.atttypmod) as typ
      from pg_constraint k
      join pg_class cl on cl.oid = k.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      where k.contype = 'f'
        and array_length(k.conkey, 1) = 1
        and k.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
        and ns.nspname = 'public'
      union
      select col.table_name::text, col.column_name::text, col.data_type::text
      from information_schema.columns col
      join information_schema.tables tb
        on tb.table_schema = col.table_schema and tb.table_name = col.table_name and tb.table_type = 'BASE TABLE'
      where col.table_schema = 'public'
        and col.column_name in (
          'user_id', 'player_id', 'student_id', 'author_id', 'coach_id',
          'created_by', 'updated_by', 'added_by', 'uploaded_by'
        )
    ) t
    where t.tbl <> 'profiles' and t.typ in ('uuid', 'text')
    order by t.tbl, t.col
  loop
    n := 0;
    d := 0;
    begin
      execute format('update public.%I set %I = $1::%s where %I = $2::%s', c.tbl, c.col, c.typ, c.col, c.typ)
        using p_keep::text, p_drop::text;
      get diagnostics n = row_count;
    exception when unique_violation then
      -- Both accounts have a row where only one is allowed (e.g. the same trophy): keep the kept account's.
      n := 0;
      for r in execute format('select ctid from public.%I where %I = $1::%s', c.tbl, c.col, c.typ) using p_drop::text loop
        begin
          execute format('update public.%I set %I = $1::%s where ctid = $2', c.tbl, c.col, c.typ) using p_keep::text, r.ctid;
          n := n + 1;
        exception when unique_violation then
          execute format('delete from public.%I where ctid = $1', c.tbl) using r.ctid;
          d := d + 1;
        end;
      end loop;
    end;
    if n > 0 or d > 0 then
      moved_from := c.tbl || '.' || c.col;
      rows_moved := n;
      rows_removed := d;
      return next;
    end if;
  end loop;

  -- One coaching space per player: the kept account's (posts are keyed by player, so nothing is lost).
  delete from public.coaching_spaces s
  where s.student_id = p_keep
    and exists (
      select 1 from public.coaching_spaces o
      where o.student_id = p_keep and o.id <> s.id and o.created_at < s.created_at
    );

  -- Uploaded files keep working for the kept login.
  begin
    update storage.objects set owner = p_keep where owner = p_drop;
  exception when others then null;
  end;
  begin
    execute 'update storage.objects set owner_id = $1 where owner_id = $2' using p_keep::text, p_drop::text;
  exception when others then null;
  end;

  update public.profiles k
  set total_xp = coalesce(k.total_xp, 0) + coalesce(dp.total_xp, 0),
      full_name = coalesce(nullif(btrim(k.full_name), ''), dp.full_name),
      preferred_icon_id = coalesce(k.preferred_icon_id, dp.preferred_icon_id)
  from public.profiles dp
  where k.id = p_keep and dp.id = p_drop;

  begin
    update public.profiles set current_level = public.xp_level(coalesce(total_xp, 0)::integer) where id = p_keep;
  exception when others then null;
  end;

  delete from public.profiles where id = p_drop;
  delete from auth.users where id = p_drop;

  moved_from := 'merged ' || p_drop::text || ' into ' || p_keep::text;
  rows_moved := null;
  rows_removed := null;
  return next;
end;
$$;

revoke all on function public.merge_player_accounts(uuid, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
