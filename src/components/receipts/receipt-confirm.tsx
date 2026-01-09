'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ReceiptItem } from '@/types/receipts'

interface Store {
  id: string
  name: string
}

interface StorageUnit {
  id: string
  name: string
  type: string
  shelves: Array<{
    id: string
    name: string
  }>
}

interface ReceiptConfirmProps {
  items: ReceiptItem[]
  store: Store | null
  newStoreName: string | null
  storageUnits: StorageUnit[]
  onConfirm: () => void
  onBack: () => void
  loading: boolean
}

const typeIcons: Record<string, string> = {
  fridge: '🧊',
  freezer: '❄️',
  pantry: '🗄️',
  cabinet: '🚪',
  other: '📦',
}

export function ReceiptConfirm({
  items,
  store,
  newStoreName,
  storageUnits,
  onConfirm,
  onBack,
  loading,
}: ReceiptConfirmProps) {
  // Filter to only active items (not skipped, has item + shelf)
  const activeItems = useMemo(() => {
    return items.filter(item =>
      !item.skip &&
      (item.manualItemId || item.isNewItem || item.match) &&
      item.shelfId
    )
  }, [items])

  // Group items by storage location
  const groupedItems = useMemo(() => {
    const groups: Record<string, {
      unit: StorageUnit
      shelf: { id: string; name: string }
      items: ReceiptItem[]
    }> = {}

    for (const item of activeItems) {
      if (!item.shelfId) continue

      // Find the storage unit and shelf
      for (const unit of storageUnits) {
        const shelf = unit.shelves.find(s => s.id === item.shelfId)
        if (shelf) {
          const key = `${unit.id}-${shelf.id}`
          if (!groups[key]) {
            groups[key] = { unit, shelf, items: [] }
          }
          groups[key].items.push(item)
          break
        }
      }
    }

    return Object.values(groups)
  }, [activeItems, storageUnits])

  // Calculate totals
  const totals = useMemo(() => {
    const itemCount = activeItems.length
    const newItemCount = activeItems.filter(i => i.isNewItem).length
    const totalPrice = activeItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    return { itemCount, newItemCount, totalPrice }
  }, [activeItems])

  const storeName = store?.name || newStoreName || 'Unknown Store'

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="text-center pb-4 border-b">
        <h3 className="text-lg font-semibold">Confirm Restock</h3>
        <p className="text-gray-600 mt-1">
          {totals.itemCount} items from <span className="font-medium">{storeName}</span>
        </p>
        {totals.newItemCount > 0 && (
          <Badge className="bg-purple-500 mt-2">{totals.newItemCount} new items will be created</Badge>
        )}
      </div>

      {/* Items by Location */}
      <div className="space-y-4 max-h-[350px] overflow-y-auto">
        {groupedItems.map(({ unit, shelf, items: groupItems }) => (
          <div key={`${unit.id}-${shelf.id}`} className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 border-b">
              <span className="font-medium">
                {typeIcons[unit.type]} {unit.name} → {shelf.name}
              </span>
              <Badge variant="secondary" className="ml-2">{groupItems.length}</Badge>
            </div>
            <div className="divide-y">
              {groupItems.map((item) => (
                <div key={item.id} className="px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {item.isNewItem && (
                      <Badge className="bg-purple-500 text-xs">New</Badge>
                    )}
                    <span className="text-sm">
                      {item.manualItemName || item.match?.itemName || item.cleanedName}
                    </span>
                    {item.quantity > 1 && (
                      <span className="text-xs text-gray-500">×{item.quantity}</span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-green-700">
                    ${(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <span className="font-semibold">Total</span>
        <span className="text-xl font-bold text-green-700">${totals.totalPrice.toFixed(2)}</span>
      </div>

      {/* What will happen */}
      <div className="text-sm text-gray-600 space-y-1">
        <p className="font-medium">This will:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          {totals.newItemCount > 0 && (
            <li>Create {totals.newItemCount} new item{totals.newItemCount > 1 ? 's' : ''} in your catalog</li>
          )}
          <li>Restock {totals.itemCount} item{totals.itemCount > 1 ? 's' : ''} to your inventory</li>
          <li>Record {totals.itemCount} price{totals.itemCount > 1 ? 's' : ''} at {storeName}</li>
          {!store && newStoreName && (
            <li>Create new store "{newStoreName}"</li>
          )}
        </ul>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-4 border-t">
        <Button variant="outline" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <Button
          onClick={onConfirm}
          className="bg-amber-500 hover:bg-amber-600"
          disabled={loading || activeItems.length === 0}
        >
          {loading ? 'Processing...' : `Restock ${totals.itemCount} Items`}
        </Button>
      </div>
    </div>
  )
}
