# BunchOfBananas

A modern household inventory management app that helps you track what's in your fridge, freezer, and pantry. Never forget what you have at home or let food go to waste again.

**Live Demo:** [bunchofbananas.vercel.app](https://bunchofbananas.vercel.app)

## Features

### Inventory Management
- **Multi-storage tracking** - Organize items across fridge, freezer, pantry, and custom storage units
- **Barcode scanning** - Quickly add items by scanning barcodes (uses Open Food Facts API)
- **Priority & condition tracking** - Mark items as "use soon" or track their condition
- **Expiration alerts** - Get notified before items expire
- **Dark mode support** - Easy on the eyes at any time of day

### Recipe Discovery
- **Smart recipe suggestions** - Find recipes based on ingredients you already have
- **Ingredient matching** - See which ingredients you have and what you need
- **Fresh video tutorials** - YouTube search links sorted by upload date for current, relevant cooking videos
- **Meal type filtering** - Filter by beef, chicken, seafood, vegetarian, and more
- **Save your own recipes** - Create and share custom recipes with your household

### Household Sharing
- **Family accounts** - Invite household members to view and manage inventory together
- **Public sharing** - Generate shareable links for guests to see what's available
- **Role-based access** - Control who can edit vs. just view

### Shopping & Pricing
- **Shopping lists** - Create lists from missing recipe ingredients or manually
- **Price tracking** - Track prices over time to find the best deals
- **Price history** - See price trends for items you buy regularly

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** Supabase (PostgreSQL with Row Level Security)
- **Styling:** Tailwind CSS + shadcn/ui
- **Language:** TypeScript
- **Email:** Resend
- **Hosting:** Vercel

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account

### Environment Variables

Create a `.env.local` file with:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
RESEND_API_KEY=your_resend_api_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Installation

```bash
# Clone the repository
git clone https://github.com/morbidsteve/bunchofbananas.git
cd bunchofbananas

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Database Setup

The app uses Supabase. Migrations are managed in `supabase/migrations/`. Apply them through the Supabase dashboard or CLI.

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint
```

## Deployment

The app is deployed on Vercel. Push to `main` to trigger a deployment, or run:

```bash
vercel --prod
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
