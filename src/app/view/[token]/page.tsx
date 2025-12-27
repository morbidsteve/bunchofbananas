import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ token: string }>
}

const typeIcons: Record<string, string> = {
  fridge: '🧊',
  freezer: '❄️',
  pantry: '🗄️',
  cabinet: '🚪',
  other: '📦',
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

  // Get inventory with item and shelf info
  const { data: inventory } = await supabase
    .from('inventory')
    .select(`
      id,
      quantity,
      unit,
      expiration_date,
      notes,
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

  // Group inventory by storage unit
  const inventoryByStorage = (storageUnits || []).map((unit) => {
    const unitInventory = (inventory || []).filter(
      (inv: any) => inv.shelves?.storage_units?.id === unit.id
    )
    return {
      ...unit,
      inventory: unitInventory,
    }
  })

  function getExpirationBadge(dateStr: string | null) {
    if (!dateStr) return null
    const today = new Date()
    const expDate = new Date(dateStr)
    const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return <Badge variant="destructive">Expired</Badge>
    } else if (diffDays <= 3) {
      return <Badge variant="destructive">Exp: {diffDays}d</Badge>
    } else if (diffDays <= 7) {
      return <Badge variant="secondary">Exp: {diffDays}d</Badge>
    }
    return null
  }

  const totalItems = inventory?.length || 0

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
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-amber-600">{totalItems}</div>
                <div className="text-sm text-gray-500">Total Items</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-amber-600">{storageUnits?.length || 0}</div>
                <div className="text-sm text-gray-500">Storage Units</div>
              </CardContent>
            </Card>
            <Card className="col-span-2 md:col-span-1">
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-amber-600">
                  {inventory?.filter((i: any) => {
                    if (!i.expiration_date) return false
                    const diff = Math.ceil((new Date(i.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    return diff <= 7 && diff >= 0
                  }).length || 0}
                </div>
                <div className="text-sm text-gray-500">Expiring Soon</div>
              </CardContent>
            </Card>
          </div>

          {/* Inventory by Storage */}
          {inventoryByStorage.length === 0 ? (
            <Card className="bg-gray-50">
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">📦</div>
                  <h3 className="text-lg font-semibold mb-2">No storage units yet</h3>
                  <p className="text-gray-600">This household hasn&apos;t set up any storage.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            inventoryByStorage.map((unit) => (
              <Card key={unit.id}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">{typeIcons[unit.type] || '📦'}</span>
                    <div>
                      <h2 className="text-lg font-semibold">{unit.name}</h2>
                      {unit.location && (
                        <p className="text-sm text-gray-500">{unit.location}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="ml-auto">
                      {unit.inventory.length} item{unit.inventory.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>

                  {unit.inventory.length === 0 ? (
                    <p className="text-gray-500 text-sm py-4">No items in this storage unit</p>
                  ) : (
                    <div className="space-y-2">
                      {unit.inventory.map((inv: any) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                          <div>
                            <span className="font-medium">{inv.items?.name}</span>
                            <span className="text-gray-500 ml-2">
                              {inv.quantity} {inv.unit}
                            </span>
                            {inv.items?.category && (
                              <Badge variant="outline" className="ml-2">
                                {inv.items.category}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">{inv.shelves?.name}</span>
                            {getExpirationBadge(inv.expiration_date)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}

          {/* Footer */}
          <div className="text-center text-sm text-gray-500 pt-8">
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
        </div>
      </main>
    </div>
  )
}
