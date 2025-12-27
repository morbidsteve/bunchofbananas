# BunchOfBananas - Setup Guide

## Supabase Database Setup

Before the app will work, you need to run the database migration in Supabase.

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project (the one with URL `diccyczhauppcmmjhwhy.supabase.co`)
3. Click on **SQL Editor** in the left sidebar

### Step 2: Run the Migration

1. Click **New Query**
2. Copy and paste the entire contents of `supabase/migrations/001_initial_schema.sql`
3. Click **Run** (or press Cmd+Enter / Ctrl+Enter)
4. You should see "Success. No rows returned" - this is expected!

### Step 3: Enable Email Auth (if not already)

1. Go to **Authentication** > **Providers**
2. Make sure **Email** is enabled
3. Optional: Disable "Confirm email" for easier testing during development
   - Go to **Authentication** > **Settings**
   - Turn off "Enable email confirmations"

### Step 4: Configure Site URL

1. Go to **Authentication** > **URL Configuration**
2. Set **Site URL** to your Vercel URL: `https://bunchofbananas.vercel.app`
3. Add to **Redirect URLs**:
   - `https://bunchofbananas.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback` (for local development)

## Vercel Environment Variables

These are already configured, but for reference:

```
NEXT_PUBLIC_SUPABASE_URL=https://diccyczhauppcmmjhwhy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_p176dT-BxrpOBFUAOYKMAw_BK8o2SRJ
```

## Local Development

1. Clone the repo
2. Run `npm install`
3. Copy `.env.local.example` to `.env.local` (or create it with the above variables)
4. Run `npm run dev`
5. Open http://localhost:3000

## Features Implemented

### Phase 1 (MVP) - DONE
- [x] User authentication (email/password)
- [x] Household creation
- [x] Storage unit management (fridge, freezer, pantry, etc.)
- [x] Shelf management within storage units
- [x] Inventory tracking with quantities and expiration dates
- [x] Shopping mode for quick search
- [x] Mobile-first responsive design
- [x] PWA manifest for "Add to Home Screen"

### Phase 2 (Coming Soon)
- [ ] Price tracking
- [ ] Store management
- [ ] "Is this a good deal?" indicator

### Phase 3 (Future)
- [ ] Analytics dashboard
- [ ] Usage reports
- [ ] Waste tracking

### Phase 4 (Future)
- [ ] AI recipe suggestions
- [ ] Smart shopping lists
- [ ] Barcode scanning

## Live URL

**Production**: https://bunchofbananas.vercel.app
