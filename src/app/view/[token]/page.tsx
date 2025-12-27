import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { PublicInventoryView } from '@/components/public/public-inventory-view'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function PublicViewPage({ params }: PageProps) {
  const { token } = await params
  const supabase = await createClient()

  // Find household by share token
  const { data: household } = await supabase
    .from('households')
    .select('id, name, is_public')
    .eq('share_token', token)
    .single()

  if (!household || !household.is_public) {
    notFound()
  }

  // Get storage units with shelves
  const { data: storageUnits } = await supabase
    .from('storage_units')
    .select(`
      id,
      name,
      type,
      location,
      shelves (
        id,
        name,
        position
      )
    `)
    .eq('household_id', household.id)
    .order('name')

  // Get inventory with item and shelf info (include priority fields)
  const { data: inventory } = await supabase
    .from('inventory')
    .select(`
      id,
      quantity,
      unit,
      expiration_date,
      notes,
      priority,
      condition_notes,
      items!inner (
        id,
        name,
        category,
        household_id
      ),
      shelves (
        id,
        name,
        storage_units (
          id,
          name,
          type
        )
      )
    `)
    .eq('items.household_id', household.id)
    .order('added_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🍌</span>
              <span className="font-bold text-gray-900">{household.name}</span>
              <Badge variant="outline">View Only</Badge>
            </div>
            <Link href="/login" className="text-sm text-amber-600 hover:underline">
              Sign in to manage
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <PublicInventoryView
          householdName={household.name}
          inventory={(inventory || []) as any}
          storageUnits={(storageUnits || []) as any}
        />

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 pt-8 mt-8 border-t">
          <p>
            Shared inventory from{' '}
            <span className="font-medium">{household.name}</span>
          </p>
          <p className="mt-1">
            Powered by{' '}
            <Link href="/" className="text-amber-600 hover:underline">
              BunchOfBananas
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
