-- SQL Script: Backfill Existing Users into Profiles Table
-- 
-- INSTRUCTIONS:
-- 1. Run this script in Supabase SQL Editor
-- 2. This is a ONE-TIME script to create profiles for all existing users in auth.users
-- 3. It will only create profiles for users who don't already have one
--
-- WARNING: This will insert rows into the profiles table. Make sure you want to run this.

-- Step 1: Check how many users need profiles (run this first to see what will happen)
-- SELECT 
--   COUNT(*) as users_without_profiles
-- FROM auth.users u
-- LEFT JOIN public.profiles p ON u.id = p.id
-- WHERE p.id IS NULL;

-- Step 2: Preview which users will get profiles created
-- SELECT 
--   u.id,
--   u.email,
--   u.created_at as user_created_at,
--   COALESCE(u.raw_user_meta_data->>'full_name', SPLIT_PART(u.email, '@', 1), 'User') as proposed_full_name
-- FROM auth.users u
-- LEFT JOIN public.profiles p ON u.id = p.id
-- WHERE p.id IS NULL
-- ORDER BY u.created_at;

-- Step 3: Backfill - Insert profiles for all users who don't have one
-- This maps auth.users.id to profiles.id (matches auth.uid())
INSERT INTO public.profiles (id, full_name, created_at)
SELECT 
  u.id,  -- Map auth.users.id to profiles.id (matches auth.uid())
  COALESCE(
    u.raw_user_meta_data->>'full_name',  -- Use metadata if available
    SPLIT_PART(u.email, '@', 1),         -- Else use email username
    'User'                                -- Else default to 'User'
  ) as full_name,
  COALESCE(u.created_at, NOW()) as created_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL  -- Only insert for users without existing profiles
ON CONFLICT (id) DO NOTHING;  -- Prevent errors if profile already exists

-- Step 4: Verify the backfill worked
-- SELECT 
--   COUNT(*) as total_profiles,
--   COUNT(DISTINCT p.id) as unique_profile_ids
-- FROM public.profiles p;

-- Step 5: Verify all users now have profiles
-- SELECT 
--   COUNT(*) as users_with_profiles
-- FROM auth.users u
-- INNER JOIN public.profiles p ON u.id = p.id;

-- Step 6: Check for any remaining users without profiles (should be 0)
-- SELECT 
--   u.id,
--   u.email,
--   u.created_at
-- FROM auth.users u
-- LEFT JOIN public.profiles p ON u.id = p.id
-- WHERE p.id IS NULL;
