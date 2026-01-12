-- SQL Command to Update All Existing Rounds to Match Your User ID
-- 
-- INSTRUCTIONS:
-- 1. Copy your User ID from the red debug banner on the Academy page
-- 2. Replace 'YOUR_USER_ID_HERE' below with your actual User ID
-- 3. Run this command in Supabase SQL Editor
--
-- WARNING: This will update ALL rounds in the database to belong to your user.
-- Only run this if you want to assign all existing rounds to your account.

-- First, check how many rounds will be affected:
-- SELECT COUNT(*) FROM rounds WHERE user_id != 'YOUR_USER_ID_HERE';

-- Update all rounds to your user_id:
UPDATE rounds 
SET user_id = 'YOUR_USER_ID_HERE'
WHERE user_id != 'YOUR_USER_ID_HERE' OR user_id IS NULL;

-- Verify the update:
-- SELECT user_id, COUNT(*) as round_count 
-- FROM rounds 
-- GROUP BY user_id;

-- If you want to update rounds to a specific user_id from auth.users table:
-- UPDATE rounds 
-- SET user_id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com')
-- WHERE user_id IS NULL OR user_id != (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
