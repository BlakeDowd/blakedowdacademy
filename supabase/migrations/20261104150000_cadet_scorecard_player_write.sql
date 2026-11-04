-- Allow enrolled juniors to save their own scorecards (and leaderboard sync rows).
-- Coaches keep full write via existing coach policies.

drop policy if exists "cadet_scorecards_player_insert" on public.cadet_scorecards;
create policy "cadet_scorecards_player_insert" on public.cadet_scorecards
  for insert to authenticated
  with check (player_id = auth.uid());

drop policy if exists "cadet_scorecard_holes_player_insert" on public.cadet_scorecard_holes;
create policy "cadet_scorecard_holes_player_insert" on public.cadet_scorecard_holes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.cadet_scorecards s
      where s.id = scorecard_id and s.player_id = auth.uid()
    )
  );

drop policy if exists "cadet_scores_player_insert" on public.cadet_scores;
create policy "cadet_scores_player_insert" on public.cadet_scores
  for insert to authenticated
  with check (player_id = auth.uid());

notify pgrst, 'reload schema';
