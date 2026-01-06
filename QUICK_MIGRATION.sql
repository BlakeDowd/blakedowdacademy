-- Quick Migration: Add profile fields to profiles table
-- Run this in Supabase SQL Editor

-- Add full_name column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Add profile_icon column with default value
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS profile_icon TEXT DEFAULT 'target';

-- Add updated_at column for tracking updates
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Verify columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('full_name', 'profile_icon', 'updated_at')
ORDER BY column_name;

