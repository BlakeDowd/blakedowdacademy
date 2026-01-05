# Supabase Setup Guide

This app uses Supabase for authentication and data storage. Follow these steps to set up your Supabase backend:

## 1. Create a Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in your project details and wait for the project to be created

## 2. Get Your API Keys

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (under "Project URL")
   - **anon/public key** (under "Project API keys")

## 3. Set Up Environment Variables

1. Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```

2. Open `.env.local` and fill in your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

## 4. Set Up Database Tables

Run these SQL commands in your Supabase SQL Editor to create the required tables:

### Profiles Table
```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  initial_handicap DECIMAL(4,1),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
```

### Rounds Table
```sql
CREATE TABLE rounds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  date DATE NOT NULL,
  course TEXT NOT NULL,
  handicap DECIMAL(4,1),
  holes INTEGER NOT NULL,
  score INTEGER,
  nett DECIMAL(5,2),
  eagles INTEGER DEFAULT 0,
  birdies INTEGER DEFAULT 0,
  pars INTEGER DEFAULT 0,
  bogeys INTEGER DEFAULT 0,
  double_bogeys INTEGER DEFAULT 0,
  fir_left INTEGER DEFAULT 0,
  fir_hit INTEGER DEFAULT 0,
  fir_right INTEGER DEFAULT 0,
  total_gir INTEGER DEFAULT 0,
  total_penalties INTEGER DEFAULT 0,
  tee_penalties INTEGER DEFAULT 0,
  approach_penalties INTEGER DEFAULT 0,
  going_for_green INTEGER DEFAULT 0,
  gir_8ft INTEGER DEFAULT 0,
  gir_20ft INTEGER DEFAULT 0,
  up_and_down_conversions INTEGER DEFAULT 0,
  missed INTEGER DEFAULT 0,
  bunker_attempts INTEGER DEFAULT 0,
  bunker_saves INTEGER DEFAULT 0,
  chip_inside_6ft INTEGER DEFAULT 0,
  double_chips INTEGER DEFAULT 0,
  total_putts INTEGER DEFAULT 0,
  three_putts INTEGER DEFAULT 0,
  missed_6ft_and_in INTEGER DEFAULT 0,
  putts_under_6ft_attempts INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own rounds
CREATE POLICY "Users can view own rounds"
  ON rounds FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own rounds
CREATE POLICY "Users can insert own rounds"
  ON rounds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own rounds
CREATE POLICY "Users can update own rounds"
  ON rounds FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own rounds
CREATE POLICY "Users can delete own rounds"
  ON rounds FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_rounds_user_id ON rounds(user_id);
CREATE INDEX idx_rounds_date ON rounds(date DESC);
```

### Auto-create Profile on Sign Up

Create a function to automatically create a profile when a user signs up:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Drills Table
```sql
CREATE TABLE drills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL, -- Video URL or content source
  type TEXT DEFAULT 'video', -- 'video', 'pdf', or 'text'
  description TEXT,
  xp_value INTEGER DEFAULT 50,
  estimated_minutes INTEGER DEFAULT 10,
  level TEXT DEFAULT 'Foundation', -- 'Foundation', 'Performance', or 'Elite'
  access_type TEXT DEFAULT 'free', -- 'free' or 'premium'
  complexity INTEGER DEFAULT 2, -- 1-5 star rating
  mechanic TEXT, -- 'Ball Striking', 'Short Game', 'Putting', 'Strategy'
  practice_mode TEXT, -- 'Technique', 'Skill', or 'Performance'
  duration TEXT, -- For video drills
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE drills ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read drills
CREATE POLICY "Anyone can view drills"
  ON drills FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only admins can insert drills (you'll need to set up admin role)
-- For now, allow authenticated users to insert (you can restrict this later)
CREATE POLICY "Authenticated users can insert drills"
  ON drills FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Only admins can update drills
CREATE POLICY "Authenticated users can update drills"
  ON drills FOR UPDATE
  TO authenticated
  USING (true);

-- Policy: Only admins can delete drills
CREATE POLICY "Authenticated users can delete drills"
  ON drills FOR DELETE
  TO authenticated
  USING (true);

-- Create index for faster queries
CREATE INDEX idx_drills_category ON drills(category);
CREATE INDEX idx_drills_level ON drills(level);
```

## 5. Test Your Setup

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to `/login` and try signing up with a new account
3. After signing up, you should be redirected to the home page
4. Try logging a round to verify database connectivity

## Troubleshooting

- **"Missing Supabase environment variables"**: Make sure your `.env.local` file exists and contains both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Authentication errors**: Verify your Supabase project is active and the API keys are correct
- **Database errors**: Make sure you've run all the SQL commands above to create the tables and policies

