-- SQL Migration: Auto-Create Profile Trigger
-- 
-- INSTRUCTIONS:
-- 1. Run this script in Supabase SQL Editor
-- 2. This creates a trigger that automatically inserts a row into public.profiles
--    every time a new user is created in auth.users
-- 3. The trigger maps auth.users.id to profiles.id
--
-- This ensures all new users automatically get a profile row created

-- Step 1: Create a function that will be called by the trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, created_at)
  VALUES (
    NEW.id,  -- Map auth.users.id to profiles.id (matches auth.uid())
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1), 'User'),  -- Use metadata if available, else email username, else 'User'
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;  -- Prevent duplicate inserts if trigger fires multiple times
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Create the trigger that fires after a user is inserted into auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Verify the trigger was created:
-- SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- Test the trigger (optional - uncomment to test):
-- INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
-- VALUES (
--   gen_random_uuid(),
--   'test@example.com',
--   crypt('testpassword', gen_salt('bf')),
--   NOW(),
--   NOW(),
--   NOW()
-- );
-- Then check: SELECT * FROM public.profiles WHERE email = 'test@example.com';
