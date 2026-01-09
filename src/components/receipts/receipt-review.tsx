'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ReceiptItem, DetectedStore, InventoryWithItem } from '@/types/receipts'

interface Store {
  id: string
  name: string
  location: string | null
}

interface Item {
  id: string
  name: string
  category: string | null
}

interface Shelf {
  id: string
  name: string
  position: number
}

interface StorageUnit {
  id: string
  name: string
  type: string
  shelves: Shelf[]
}

interface ReceiptReviewProps {
  items: ReceiptItem[]
  detectedStore: DetectedStore | null
  stores: Store[]
  allItems: Item[]
  inventory: InventoryWithItem[]
  storageUnits: StorageUnit[]
  onItemsChange: (items: ReceiptItem[]) => void
  onStoreChange: (storeId: string | null, newStoreName?: string) => void
  selectedStoreId: string | null
  newStoreName: string
  onConfirm: () => void
  onBack: () => void
}

const typeIcons: Record<string, string> = {
  fridge: '🧊',
  freezer: '❄️',
  pantry: '🗄️',
  cabinet: '🚪',
  other: '📦',
}

export function ReceiptReview({
  items,
  detectedStore,
  stores,
  allItems,
  inventory,
  storageUnits,
  onItemsChange,
  onStoreChange,
  selectedStoreId,
  newStoreName,
  onConfirm,
  onBack,
}: ReceiptReviewProps) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  // Count statistics
  const stats = useMemo(() => {
    const matched = items.filter(i => !i.skip && (i.match?.confidence === 'high' || i.manualItemId))
    const needsReview = items.filter(i => !i.skip && !i.manualItemId && (!i.match || i.match.confidence === 'low'))
    const skipped = items.filter(i => i.skip)
    return { matched: matched.length, needsReview: needsReview.length, skipped: skipped.length }
  }, [items])

  // Find existing inventory location for an item
  const getExistingShelfId = (itemId: string): string | null => {
    const inv = inventory.find(i => i.item_id === itemId)
    return inv?.shelf_id ?? null
  }

  const updateItem = (id: string, updates: Partial<ReceiptItem>) => {
    const newItems = items.map(item =>
      item.id === id ? { ...item, ...updates } : item
    )
    onItemsChange(newItems)
  }

  const toggleSkip = (id: string) => {
    const item = items.find(i => i.id === id)
    if (item) {
      updateItem(id, { skip: !item.skip })
    }
  }

  const selectManualItem = (receiptItemId: string, itemId: string) => {
    const selectedItem = allItems.find(i => i.id === itemId)
    if (selectedItem) {
      const existingShelfId = getExistingShelfId(itemId)
      updateItem(receiptItemId, {
        manualItemId: itemId,
        manualItemName: selectedItem.name,
        isNewItem: false,
        shelfId: existingShelfId || undefined,
      })
    }
  }

  const createNewItem = (receiptItemId: string) => {
    updateItem(receiptItemId, {
      manualItemId: undefined,
      manualItemName: undefined,
      isNewItem: true,
    })
  }

  const setShelf = (receiptItemId: string, shelfId: string) => {
    updateItem(receiptItemId, { shelfId })
  }

  const setCategory = (receiptItemId: string, category: string) => {
    updateItem(receiptItemId, { newItemCategory: category })
  }

  const updatePrice = (receiptItemId: string, price: string) => {
    const numPrice = parseFloat(price)
    if (!isNaN(numPrice) && numPrice >= 0) {
      updateItem(receiptItemId, { price: numPrice })
    }
  }

  const acceptAllHighConfidence = () => {
    const newItems = items.map(item => {
      if (item.match?.confidence === 'high' && !item.skip) {
        const existingShelfId = item.match.shelfId || getExistingShelfId(item.match.itemId)
        return {
          ...item,
          manualItemId: item.match.itemId,
          manualItemName: item.match.itemName,
          shelfId: existingShelfId || item.shelfId,
        }
      }
      return item
    })
    onItemsChange(newItems)
  }

  // Check if we can proceed
  const canProceed = useMemo(() => {
    // Need store selected
    if (!selectedStoreId && !newStoreName) return false

    // All non-skipped items need either a match or to be marked as new
    const activeItems = items.filter(i => !i.skip)
    if (activeItems.length === 0) return false

    for (const item of activeItems) {
      // Need item selection
      if (!item.manualItemId && !item.isNewItem && !item.match) return false
      // Need shelf for restocking
      if (!item.shelfId) return false
    }

    return true
  }, [items, selectedStoreId, newStoreName])

  // Get default shelf (first available)
  const defaultShelfId = storageUnits[0]?.shelves[0]?.id

  return (
    <div className="space-y-6">
      {/* Store Selection */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Store</Label>
        {detectedStore && !selectedStoreId && !newStoreName && (
          <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
            <Badge className="bg-green-600">Auto-detected</Badge>
            <span className="text-sm">{detectedStore.name}</span>
            {detectedStore.matchedId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onStoreChange(detectedStore.matchedId!, undefined)}
                className="ml-auto"
              >
                Use This
              </Button>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Select
              value={selectedStoreId || 'none'}
              onValueChange={(value) => onStoreChange(value === 'none' ? null : value, undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select store" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- Select --</SelectItem>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Input
              placeholder="Or new store name"
              value={newStoreName}
              onChange={(e) => onStoreChange(null, e.target.value)}
              disabled={!!selectedStoreId}
            />
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex gap-2 flex-wrap">
        <Badge variant="secondary">{items.length} items found</Badge>
        <Badge className="bg-green-600">{stats.matched} matched</Badge>
        {stats.needsReview > 0 && (
          <Badge className="bg-orange-500">{stats.needsReview} need review</Badge>
        )}
        {stats.skipped > 0 && (
          <Badge variant="outline">{stats.skipped} skipped</Badge>
        )}
        {stats.matched < items.filter(i => i.match?.confidence === 'high').length && (
          <Button size="sm" variant="link" onClick={acceptAllHighConfidence} className="text-xs">
            Accept all high-confidence matches
          </Button>
        )}
      </div>

      {/* Items List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {items.map((item) => {
          const isExpanded = expandedItemId === item.id
          const hasMatch = item.match && item.match.confidence === 'high'
          const needsAttention = !item.skip && !item.manualItemId && !item.isNewItem && (!item.match || item.match.confidence === 'low')
          const isComplete = !item.skip && (item.manualItemId || item.isNewItem) && item.shelfId

          return (
            <div
              key={item.id}
              className={`border rounded-lg p-3 ${
                item.skip ? 'opacity-50 bg-gray-50' :
                isComplete ? 'bg-green-50 border-green-200' :
                needsAttention ? 'bg-orange-50 border-orange-200' :
                'bg-white'
              }`}
            >
              {/* Row 1: Item name, price, skip */}
              <div className="flex items-start gap-2">
                <button
                  onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${item.skip ? 'line-through text-gray-400' : ''}`}>
                      {item.manualItemName || item.match?.itemName || item.cleanedName}
                    </span>
                    {hasMatch && !item.manualItemId && (
                      <Badge className="bg-blue-500 text-xs">Suggested</Badge>
                    )}
                    {item.isNewItem && (
                      <Badge className="bg-purple-500 text-xs">New</Badge>
                    )}
                    {isComplete && (
                      <span className="text-green-600">✓</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    Receipt: {item.rawName}
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-green-700">${item.price.toFixed(2)}</span>
                  <Button
                    size="sm"
                    variant={item.skip ? 'secondary' : 'ghost'}
                    onClick={(e) => { e.stopPropagation(); toggleSkip(item.id); }}
                    className="text-xs px-2"
                  >
                    {item.skip ? 'Include' : 'Skip'}
                  </Button>
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && !item.skip && (
                <div className="mt-3 pt-3 border-t space-y-3">
                  {/* Price edit */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.price}
                        onChange={(e) => updatePrice(item.id, e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                        className="h-8"
                      />
                    </div>
                  </div>

                  {/* Item matching */}
                  <div>
                    <Label className="text-xs">Match to Item</Label>
                    <Select
                      value={item.manualItemId || (item.isNewItem ? '__new__' : '__none__')}
                      onValueChange={(value) => {
                        if (value === '__new__') {
                          createNewItem(item.id)
                        } else if (value === '__none__') {
                          updateItem(item.id, { manualItemId: undefined, manualItemName: undefined, isNewItem: false })
                        } else {
                          selectManualItem(item.id, value)
                        }
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select item..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- Select --</SelectItem>
                        <SelectItem value="__new__">+ Create New Item</SelectItem>
                        {item.match && (
                          <SelectItem value={item.match.itemId}>
                            {item.match.itemName} ({Math.round(item.match.score * 100)}% match)
                          </SelectItem>
                        )}
                        {allItems
                          .filter(i => i.id !== item.match?.itemId)
                          .map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.name} {i.category && `(${i.category})`}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* New item category */}
                  {item.isNewItem && (
                    <div>
                      <Label className="text-xs">Category (optional)</Label>
                      <Input
                        placeholder="e.g., Dairy, Produce"
                        value={item.newItemCategory || ''}
                        onChange={(e) => setCategory(item.id, e.target.value)}
                        className="h-8"
                      />
                    </div>
                  )}

                  {/* Shelf selection */}
                  <div>
                    <Label className="text-xs">Restock Location</Label>
                    <Select
                      value={item.shelfId || '__none__'}
                      onValueChange={(value) => setShelf(item.id, value === '__none__' ? '' : value)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select shelf..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- Select --</SelectItem>
                        {storageUnits.map((unit) => (
                          <div key={unit.id}>
                            <div className="px-2 py-1 text-xs font-semibold text-gray-500">
                              {typeIcons[unit.type]} {unit.name}
                            </div>
                            {unit.shelves
                              .sort((a, b) => a.position - b.position)
                              .map((shelf) => (
                                <SelectItem key={shelf.id} value={shelf.id}>
                                  └ {shelf.name}
                                </SelectItem>
                              ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Quick shelf assign for items without shelves */}
      {items.some(i => !i.skip && !i.shelfId && (i.manualItemId || i.isNewItem || i.match)) && defaultShelfId && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800 mb-2">
            Some items don't have a storage location assigned.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const newItems = items.map(item => {
                if (!item.skip && !item.shelfId && (item.manualItemId || item.isNewItem || item.match)) {
                  return { ...item, shelfId: defaultShelfId }
                }
                return item
              })
              onItemsChange(newItems)
            }}
          >
            Assign all to {storageUnits[0]?.name} - {storageUnits[0]?.shelves[0]?.name}
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-4 border-t">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={onConfirm}
          className="bg-amber-500 hover:bg-amber-600"
          disabled={!canProceed}
        >
          Review & Confirm
        </Button>
      </div>
    </div>
  )
}
