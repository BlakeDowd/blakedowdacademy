-- RLS alone does not grant table privileges. Without GRANT, role "authenticated"
-- cannot INSERT/UPDATE player_goals even when policies pass (Postgres returns permission denied).

GRANT SELECT, INSERT, UPDATE ON public.player_goals TO authenticated;
GRANT ALL ON public.player_goals TO service_role;

NOTIFY pgrst, 'reload schema';
