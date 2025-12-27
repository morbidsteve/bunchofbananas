'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface InventoryItem {
  id: string
  quantity: number
  unit: string
  expiration_date: string | null
  items: {
    id: string
    name: string
    category: string | null
  } | null
  shelves: {
    name: string
    storage_units: {
      name: string
      type: string
    } | null
  } | null
}

interface ShoppingModeProps {
  inventory: InventoryItem[]
}

const typeIcons: Record<string, string> = {
  fridge: '🧊',
  freezer: '❄️',
  pantry: '🗄️',
  cabinet: '🚪',
  other: '📦',
}

export function ShoppingMode({ inventory }: ShoppingModeProps) {
  const [search, setSearch] = useState('')

  const filteredInventory = search.length >= 2
    ? inventory.filter((inv) =>
        inv.items?.name.toLowerCase().includes(search.toLowerCase()) ||
        inv.items?.category?.toLowerCase().includes(search.toLowerCase())
      )
    : []

  // Group by category
  const groupedByCategory = filteredInventory.reduce((acc, inv) => {
    const category = inv.items?.category || 'Uncategorized'
    if (!acc[category]) acc[category] = []
    acc[category].push(inv)
    return acc
  }, {} as Record<string, InventoryItem[]>)

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-4xl mb-2">🛒</div>
        <h1 className="text-3xl font-bold text-gray-900">Shopping Mode</h1>
        <p className="text-gray-600 mt-1">Search to see what you have at home</p>
      </div>

      {/* Large Search Input */}
      <div className="max-w-lg mx-auto">
        <Input
          placeholder="Do we have milk? Search here..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-lg py-6 text-center"
          autoFocus
        />
      </div>

      {/* Results */}
      {search.length >= 2 && (
        <div className="max-w-lg mx-auto space-y-4">
          {filteredInventory.length === 0 ? (
            <Card className="bg-red-50 border-red-200">
              <CardContent className="py-6 text-center">
                <div className="text-3xl mb-2">❌</div>
                <p className="text-lg font-medium text-red-800">
                  No &quot;{search}&quot; found at home
                </p>
                <p className="text-sm text-red-600 mt-1">
                  You might need to buy this!
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="bg-green-50 border-green-200">
                <CardContent className="py-4 text-center">
                  <div className="text-2xl mb-1">✓</div>
                  <p className="font-medium text-green-800">
                    Found {filteredInventory.length} matching item{filteredInventory.length !== 1 ? 's' : ''}
                  </p>
                </CardContent>
              </Card>

              {Object.entries(groupedByCategory).map(([category, items]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                    {category}
                  </h3>
                  <div className="space-y-2">
                    {items.map((inv) => (
                      <Card key={inv.id}>
                        <CardContent className="py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">
                                {typeIcons[inv.shelves?.storage_units?.type || 'other']}
                              </span>
                              <div>
                                <div className="font-medium text-lg">{inv.items?.name}</div>
                                <div className="text-sm text-gray-500">
                                  {inv.shelves?.storage_units?.name} → {inv.shelves?.name}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-semibold">
                                {inv.quantity} {inv.unit}
                              </div>
                              {inv.expiration_date && (
                                <Badge
                                  variant={
                                    new Date(inv.expiration_date) <= new Date()
                                      ? 'destructive'
                                      : 'secondary'
                                  }
                                  className="text-xs"
                                >
                                  Exp: {new Date(inv.expiration_date).toLocaleDateString()}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Helper text */}
      {search.length < 2 && inventory.length > 0 && (
        <div className="text-center text-gray-500">
          <p>Type at least 2 characters to search</p>
          <p className="text-sm mt-1">
            {inventory.length} items in your inventory
          </p>
        </div>
      )}

      {inventory.length === 0 && (
        <Card className="max-w-lg mx-auto bg-gray-50">
          <CardContent className="py-6 text-center">
            <p className="text-gray-600">
              No items in your inventory yet. Add some items first!
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
