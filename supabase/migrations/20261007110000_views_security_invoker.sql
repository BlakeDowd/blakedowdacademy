-- Views run with their owner's rights by default, which skips row level security on the tables
-- underneath (Supabase advisor: "Security Definer View"). security_invoker makes each view apply
-- the querying user's RLS instead. The app doesn't read these views; they're for SQL reporting.

do $$
declare
  v text;
begin
  foreach v in array array['combine_rankings', 'PuttingTest8to20', 'PuttingTest20to40'] loop
    if exists (
      select 1 from pg_views where schemaname = 'public' and viewname = v
    ) then
      execute format('alter view public.%I set (security_invoker = true)', v);
    end if;
  end loop;
end $$;
