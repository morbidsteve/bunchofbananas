import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100">
      <div className="container mx-auto px-4 py-16">
        <nav className="flex justify-between items-center mb-16">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🍌</span>
            <span className="text-xl font-bold text-gray-800">BunchOfBananas</span>
          </div>
          <div className="flex gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-amber-500 hover:bg-amber-600">Get Started</Button>
            </Link>
          </div>
        </nav>

        <main className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Know what&apos;s in your kitchen
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Track your fridge, freezer, and pantry. Never buy too much again.
            Know if you&apos;re getting a good deal. Get recipe suggestions based on what you have.
          </p>
          <Link href="/signup">
            <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-lg px-8 py-6">
              Start Tracking Free
            </Button>
          </Link>

          <div className="grid md:grid-cols-3 gap-8 mt-20">
            <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg">
              <div className="text-4xl mb-4">🗄️</div>
              <h3 className="text-xl font-semibold mb-2">Organize Storage</h3>
              <p className="text-gray-600">
                Map out your fridges, freezers, and pantries. Add shelves and know exactly where everything is.
              </p>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-xl font-semibold mb-2">Track Prices</h3>
              <p className="text-gray-600">
                Record what you pay and where. See price history and know when you&apos;re getting a good deal.
              </p>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2">Get Insights</h3>
              <p className="text-gray-600">
                See what you use most, what expires, and reduce food waste with smart analytics.
              </p>
            </div>
          </div>

          <div className="mt-20 bg-white/80 backdrop-blur rounded-2xl p-8 shadow-lg">
            <h2 className="text-2xl font-bold mb-4">Shopping made simple</h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              At the store wondering &quot;Do we have milk?&quot; Just open the app and search.
              See exactly what you have, where it is, and when you last bought it.
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
