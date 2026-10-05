-- Replies ("Say something…") on coaching posts. A reply is a post row with parent_id set.
alter table public.coaching_posts
  add column if not exists parent_id uuid references public.coaching_posts (id) on delete cascade;

create index if not exists coaching_posts_parent_idx
  on public.coaching_posts (parent_id, created_at)
  where parent_id is not null;

drop policy if exists "coaching_posts_insert" on public.coaching_posts;
create policy "coaching_posts_insert"
  on public.coaching_posts for insert to authenticated
  with check (
    author_id = auth.uid()
    and (student_id = auth.uid() or public.is_coach())
    and (
      coaching_posts.parent_id is null
      or exists (
        select 1 from public.coaching_posts parent
        where parent.id = coaching_posts.parent_id
          and parent.student_id = coaching_posts.student_id
          and parent.parent_id is null
      )
    )
  );

notify pgrst, 'reload schema';
