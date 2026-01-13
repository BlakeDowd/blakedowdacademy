-- QUICK BACKFILL: Copy and paste this entire block into Supabase SQL Editor
-- This will create profiles for all existing users in auth.users

INSERT INTO public.profiles (id, full_name, created_at)
SELECT 
  u.id,  -- Maps auth.users.id to profiles.id (matches auth.uid())
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    SPLIT_PART(u.email, '@', 1),
    'User'
  ) as full_name,
  COALESCE(u.created_at, NOW()) as created_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Verify it worked:
-- SELECT COUNT(*) FROM public.profiles;
