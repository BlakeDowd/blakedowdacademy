-- Migration: Add full_name and profile_icon columns to profiles table
-- Created: 2024

-- Add full_name column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'full_name'
    ) THEN
        ALTER TABLE profiles 
        ADD COLUMN full_name TEXT;
    END IF;
END $$;

-- Add profile_icon column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'profile_icon'
    ) THEN
        ALTER TABLE profiles 
        ADD COLUMN profile_icon TEXT DEFAULT 'target';
    END IF;
END $$;

-- Add updated_at column if it doesn't exist (for tracking profile updates)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE profiles 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Create index on full_name for faster searches (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON profiles(full_name);

-- Add comment to columns for documentation
COMMENT ON COLUMN profiles.full_name IS 'User''s full name for display throughout the app';
COMMENT ON COLUMN profiles.profile_icon IS 'Selected profile icon identifier (target, trophy, award, star, zap, flag)';
COMMENT ON COLUMN profiles.updated_at IS 'Timestamp of last profile update';

