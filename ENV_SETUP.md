# Environment Variables Setup

## Required Environment Variables

The app requires the following environment variables to be set:

### For Local Development (.env.local)

Create a `.env.local` file in the root directory with:

```
NEXT_PUBLIC_SUPABASE_URL=https://zdhzarkguvvrwzjuiqdc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### For Vercel Production

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add these variables:
   - **NEXT_PUBLIC_SUPABASE_URL** = `https://zdhzarkguvvrwzjuiqdc.supabase.co`
   - **NEXT_PUBLIC_SUPABASE_ANON_KEY** = Your Supabase anon/public key
3. Make sure they're set for **Production** environment
4. Redeploy your project after adding the variables

### How to Find Your Supabase Anon Key

1. Go to your Supabase project dashboard: https://zdhzarkguvvrwzjuiqdc.supabase.co
2. Navigate to **Settings** → **API**
3. Copy the **anon public** key
4. Paste it into your environment variables

### Verification

After setting the variables, check the debug banner on the Academy page:
- **Env URL:** Should show "Set ✓"
- **Env Key:** Should show "Set"
- **Supabase URL:** Should show the correct URL
