'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface InventoryItem {
  id: string
  quantity: number
  unit: string
  expiration_date: string | null
  notes: string | null
  priority?: 'normal' | 'use_soon' | 'urgent'
  condition_notes?: string | null
  items: {
    id: string
    name: string
    category: string | null
  } | null
  shelves: {
    id: string
    name: string
    storage_units: {
      id: string
      name: string
      type: string
    } | null
  } | null
}

interface StorageUnit {
  id: string
  name: string
  type: string
  location: string | null
  shelves: {
    id: string
    name: string
    position: number
  }[]
}

interface PublicInventoryViewProps {
  householdName: string
  inventory: InventoryItem[]
  storageUnits: StorageUnit[]
}

const typeIcons: Record<string, string> = {
  fridge: '🧊',
  freezer: '❄️',
  pantry: '🗄️',
  cabinet: '🚪',
  other: '📦',
}

export function PublicInventoryView({
  householdName,
  inventory,
  storageUnits,
}: PublicInventoryViewProps) {
  const [search, setSearch] = useState('')
  const [selectedStorage, setSelectedStorage] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showExpiringOnly, setShowExpiringOnly] = useState(false)
  const [showPriorityOnly, setShowPriorityOnly] = useState(false)

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>()
    inventory.forEach((inv) => {
      if (inv.items?.category) {
        cats.add(inv.items.category)
      }
    })
    return Array.from(cats).sort()
  }, [inventory])

  // Filter inventory
  const filteredInventory = useMemo(() => {
    return inventory.filter((inv) => {
      // Search filter
      const matchesSearch =
        !search ||
        inv.items?.name.toLowerCase().includes(search.toLowerCase()) ||
        inv.items?.category?.toLowerCase().includes(search.toLowerCase()) ||
        inv.shelves?.name.toLowerCase().includes(search.toLowerCase()) ||
        inv.shelves?.storage_units?.name.toLowerCase().includes(search.toLowerCase())

      // Storage filter
      const matchesStorage =
        !selectedStorage || inv.shelves?.storage_units?.id === selectedStorage

      // Category filter
      const matchesCategory =
        !selectedCategory || inv.items?.category === selectedCategory

      // Expiring filter
      let matchesExpiring = true
      if (showExpiringOnly) {
        if (!inv.expiration_date) {
          matchesExpiring = false
        } else {
          const diff = Math.ceil(
            (new Date(inv.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
          matchesExpiring = diff <= 7 && diff >= 0
        }
      }

      // Priority filter
      const matchesPriority =
        !showPriorityOnly || (inv.priority && inv.priority !== 'normal')

      // Exclude depleted items
      const hasQuantity = inv.quantity > 0

      return (
        matchesSearch &&
        matchesStorage &&
        matchesCategory &&
        matchesExpiring &&
        matchesPriority &&
        hasQuantity
      )
    })
  }, [inventory, search, selectedStorage, selectedCategory, showExpiringOnly, showPriorityOnly])

  // Group filtered inventory by storage unit
  const inventoryByStorage = useMemo(() => {
    return storageUnits
      .map((unit) => ({
        ...unit,
        inventory: filteredInventory.filter(
          (inv) => inv.shelves?.storage_units?.id === unit.id
        ),
      }))
      .filter((unit) => unit.inventory.length > 0 || !search)
  }, [storageUnits, filteredInventory, search])

  // Stats
  const totalItems = filteredInventory.length
  const expiringCount = inventory.filter((inv) => {
    if (!inv.expiration_date) return false
    const diff = Math.ceil(
      (new Date(inv.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
    return diff <= 7 && diff >= 0
  }).length
  const priorityCount = inventory.filter(
    (inv) => inv.priority && inv.priority !== 'normal' && inv.quantity > 0
  ).length

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

  const hasFilters = search || selectedStorage || selectedCategory || showExpiringOnly || showPriorityOnly

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-amber-600">{inventory.length}</div>
            <div className="text-sm text-gray-500">Total Items</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-amber-600">{storageUnits.length}</div>
            <div className="text-sm text-gray-500">Storage Units</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-amber-600">{expiringCount}</div>
            <div className="text-sm text-gray-500">Expiring Soon</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-amber-600">{categories.length}</div>
            <div className="text-sm text-gray-500">Categories</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <Input
          placeholder="Search items, categories, storage..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />

        <div className="flex flex-wrap gap-2">
          {/* Storage filter buttons */}
          <Button
            variant={selectedStorage === null ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setSelectedStorage(null)}
          >
            All Storage
          </Button>
          {storageUnits.map((unit) => (
            <Button
              key={unit.id}
              variant={selectedStorage === unit.id ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setSelectedStorage(selectedStorage === unit.id ? null : unit.id)}
            >
              {typeIcons[unit.type]} {unit.name}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Category filter buttons */}
          {categories.length > 0 && (
            <>
              <Button
                variant={selectedCategory === null ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(null)}
              >
                All Categories
              </Button>
              {categories.map((cat) => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                >
                  {cat}
                </Button>
              ))}
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Quick filters */}
          {expiringCount > 0 && (
            <Button
              variant={showExpiringOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowExpiringOnly(!showExpiringOnly)}
              className={showExpiringOnly ? 'bg-red-500 hover:bg-red-600' : 'border-red-300 text-red-600'}
            >
              Expiring Soon ({expiringCount})
            </Button>
          )}
          {priorityCount > 0 && (
            <Button
              variant={showPriorityOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowPriorityOnly(!showPriorityOnly)}
              className={showPriorityOnly ? 'bg-orange-500 hover:bg-orange-600' : 'border-orange-300 text-orange-600'}
            >
              Use Soon ({priorityCount})
            </Button>
          )}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setSelectedStorage(null)
                setSelectedCategory(null)
                setShowExpiringOnly(false)
                setShowPriorityOnly(false)
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Results info */}
      {hasFilters && (
        <p className="text-sm text-gray-500">
          Showing {totalItems} of {inventory.length} items
        </p>
      )}

      {/* Inventory by Storage */}
      {inventoryByStorage.length === 0 ? (
        <Card className="bg-gray-50">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="text-4xl mb-4">📦</div>
              <h3 className="text-lg font-semibold mb-2">
                {hasFilters ? 'No matching items' : 'No items yet'}
              </h3>
              <p className="text-gray-600">
                {hasFilters
                  ? 'Try adjusting your search or filters'
                  : "This household hasn't added any items yet."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        inventoryByStorage.map((unit) => (
          <Card
            key={unit.id}
            className={selectedStorage === unit.id ? 'ring-2 ring-amber-500' : ''}
          >
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
                <p className="text-gray-500 text-sm py-4">No items match your filters</p>
              ) : (
                <div className="space-y-2">
                  {unit.inventory.map((inv) => (
                    <div
                      key={inv.id}
                      className={`flex items-center justify-between py-2 border-b last:border-0 ${
                        inv.priority === 'urgent'
                          ? 'bg-red-50 -mx-2 px-2 rounded'
                          : inv.priority === 'use_soon'
                          ? 'bg-orange-50 -mx-2 px-2 rounded'
                          : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{inv.items?.name}</span>
                        <span className="text-gray-500 ml-2">
                          {inv.quantity} {inv.unit}
                        </span>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {inv.items?.category && (
                            <Badge variant="outline">{inv.items.category}</Badge>
                          )}
                          {inv.priority === 'urgent' && (
                            <Badge className="bg-red-500">Urgent</Badge>
                          )}
                          {inv.priority === 'use_soon' && (
                            <Badge className="bg-orange-500">Use Soon</Badge>
                          )}
                        </div>
                        {inv.condition_notes && (
                          <p className="text-sm text-orange-700 mt-1 italic">
                            {inv.condition_notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
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
    </div>
  )
}
