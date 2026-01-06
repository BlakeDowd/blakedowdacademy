# Supabase Migration Instructions

## Adding Profile Fields to Profiles Table

This migration adds the `full_name` and `profile_icon` columns to the `profiles` table in Supabase.

### Option 1: Using Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to your Supabase project dashboard
   - Navigate to **SQL Editor** in the left sidebar

2. **Run the Migration**
   - Copy the contents of `supabase/migrations/add_profile_fields.sql`
   - Paste it into the SQL Editor
   - Click **Run** to execute the migration

3. **Verify the Changes**
   - Go to **Table Editor** → **profiles** table
   - Confirm that `full_name` and `profile_icon` columns are now present

4. **Refresh Schema Cache**
   - The schema cache should refresh automatically
   - If needed, you can manually refresh by:
     - Going to **Settings** → **API**
     - Clicking **Refresh** next to "Schema Cache"
     - Or simply wait a few seconds for auto-refresh

### Option 2: Using Supabase CLI

If you have Supabase CLI installed:

```bash
# Apply the migration
supabase db push

# Or if using migrations folder
supabase migration up
```

### Option 3: Direct SQL (Alternative)

If you prefer a simpler approach, run this SQL directly in the Supabase SQL Editor:

```sql
-- Add full_name column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Add profile_icon column with default
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS profile_icon TEXT DEFAULT 'target';

-- Add updated_at column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
```

### Verification

After running the migration, verify the columns exist:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('full_name', 'profile_icon', 'updated_at');
```

### Notes

- The `profile_icon` column defaults to `'target'` for existing users
- The `full_name` column is nullable (existing users without names will show "Academy Student")
- The `updated_at` column will automatically track when profiles are updated

### Troubleshooting

If you still see schema cache errors:
1. Wait 10-30 seconds for automatic cache refresh
2. Clear your browser cache and reload
3. Restart your Next.js development server
4. Check Supabase Dashboard → Settings → API for schema refresh option

