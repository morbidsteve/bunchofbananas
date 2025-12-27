# BunchOfBananas - Claude Code Instructions

## Project Overview
BunchOfBananas is a household inventory management app built with Next.js 16, Supabase, and Tailwind CSS.

## Development Workflow

### After making changes:
1. **Always run the build** to verify compilation: `npm run build`
2. **Push to GitHub**: `git add -A && git commit -m "description" && git push origin main`
3. **Deploy to Vercel**: `vercel --prod`
4. **Apply database migrations** if any using the Supabase MCP tools

### Database Migrations
- Create migration files in `supabase/migrations/`
- Apply migrations using `mcp__plugin_supabase_supabase__apply_migration`
- Check existing migrations with `mcp__plugin_supabase_supabase__list_migrations`
- Project ID: `diccyczhauppcmmjhwhy`

## Key Features
- Inventory tracking across storage units (fridge, freezer, pantry)
- Barcode scanning with Open Food Facts API
- Recipe suggestions based on inventory
- Household sharing (public view and member invites)
- Price tracking and shopping lists
- Priority/condition tracking for items

## Tech Stack
- Next.js 16.1.1 (App Router)
- Supabase (PostgreSQL with RLS)
- Tailwind CSS + shadcn/ui
- TypeScript
- Resend for emails (requires RESEND_API_KEY env var)

## Environment Variables Needed
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `RESEND_API_KEY` (for invite emails)
- `NEXT_PUBLIC_SITE_URL` (for email links)

## Deployment
- Production URL: https://bunchofbananas.vercel.app
- GitHub: https://github.com/morbidsteve/bunchofbananas
