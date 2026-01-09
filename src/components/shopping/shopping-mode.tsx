'use client'

import { useState, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

// Lazy load the receipt wizard to avoid SSR issues with Tesseract
const ReceiptWizard = lazy(() =>
  import('@/components/receipts/receipt-wizard').then(mod => ({ default: mod.ReceiptWizard }))
)

interface InventoryItem {
  id: string
  item_id: string
  shelf_id: string
  quantity: number
  unit: string
  expiration_date: string | null
  items: {
    id: string
    name: string
    category: string | null
    do_not_restock?: boolean
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

interface DepletedItem {
  id: string
  name: string
  category: string | null
}

interface ShoppingListItem {
  id: string
  item_id: string | null
  custom_name: string | null
  quantity: number
  unit: string | null
  is_checked: boolean
  notes: string | null
  created_at: string
  items: {
    id: string
    name: string
    category: string | null
  } | null
}

interface BestPrice {
  itemId: string
  pricePerUnit: number
  displayUnit: string
  storeName: string
  storeLocation: string | null
  originalPrice: number
  originalQuantity: number
  originalUnit: string
  packageSize: number | null
  packageUnit: string | null
  onSale: boolean
  recordedAt: string
}

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

interface ShoppingModeProps {
  inventory: InventoryItem[]
  depletedItems?: DepletedItem[]
  shoppingList?: ShoppingListItem[]
  bestPrices?: Record<string, BestPrice>
  householdId: string
  userId?: string
  stores?: Store[]
  storageUnits?: StorageUnit[]
  allItems?: Item[]
}

const typeIcons: Record<string, string> = {
  fridge: '🧊',
  freezer: '❄️',
  pantry: '🗄️',
  cabinet: '🚪',
  other: '📦',
}

export function ShoppingMode({
  inventory,
  depletedItems = [],
  shoppingList = [],
  bestPrices = {},
  householdId,
  userId,
  stores = [],
  storageUnits = [],
  allItems = [],
}: ShoppingModeProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [showRestockList, setShowRestockList] = useState(true)
  const [showShoppingList, setShowShoppingList] = useState(true)
  const [newItemName, setNewItemName] = useState('')
  const [addingItem, setAddingItem] = useState(false)
  const [showReceiptWizard, setShowReceiptWizard] = useState(false)

  // Add item to shopping list
  async function addToShoppingList(itemId: string | null, customName?: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('shopping_list').insert({
      household_id: householdId,
      item_id: itemId,
      custom_name: customName || null,
      added_by: user.id,
    })

    if (error) {
      toast.error('Failed to add to shopping list')
    } else {
      toast.success('Added to shopping list')
      router.refresh()
    }
  }

  // Toggle item checked status
  async function toggleChecked(listItemId: string, currentChecked: boolean) {
    const supabase = createClient()
    const { error } = await supabase
      .from('shopping_list')
      .update({ is_checked: !currentChecked })
      .eq('id', listItemId)

    if (error) {
      toast.error('Failed to update item')
    } else {
      router.refresh()
    }
  }

  // Remove item from shopping list
  async function removeFromShoppingList(listItemId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('shopping_list')
      .delete()
      .eq('id', listItemId)

    if (error) {
      toast.error('Failed to remove item')
    } else {
      toast.success('Removed from list')
      router.refresh()
    }
  }

  // Clear all checked items
  async function clearCheckedItems() {
    const supabase = createClient()
    const checkedIds = shoppingList.filter(item => item.is_checked).map(item => item.id)

    if (checkedIds.length === 0) return

    const { error } = await supabase
      .from('shopping_list')
      .delete()
      .in('id', checkedIds)

    if (error) {
      toast.error('Failed to clear items')
    } else {
      toast.success(`Cleared ${checkedIds.length} items`)
      router.refresh()
    }
  }

  // Add custom item to list
  async function handleAddCustomItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newItemName.trim()) return

    setAddingItem(true)
    await addToShoppingList(null, newItemName.trim())
    setNewItemName('')
    setAddingItem(false)
  }

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

  // Convert inventory to format needed by ReceiptWizard
  const inventoryForWizard = inventory.map(inv => ({
    id: inv.id,
    item_id: inv.item_id,
    shelf_id: inv.shelf_id,
    quantity: inv.quantity,
    unit: inv.unit,
    items: inv.items,
    shelves: inv.shelves,
  }))

  // Check if receipt scanner can be used
  const canUseReceiptScanner = userId && storageUnits.length > 0 && storageUnits.some(u => u.shelves.length > 0)

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-4xl mb-2" aria-hidden="true">🛒</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Shopping Mode</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Search to see what you have at home</p>
      </div>

      {/* Scan Receipt Button */}
      {canUseReceiptScanner && (
        <div className="max-w-lg mx-auto">
          <Button
            onClick={() => setShowReceiptWizard(true)}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white py-6 text-lg"
          >
            <span className="mr-2">📷</span> Scan Receipt to Restock
          </Button>
        </div>
      )}

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
                <div className="text-3xl mb-2" aria-hidden="true">❌</div>
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
                  <div className="text-2xl mb-1" aria-hidden="true">✓</div>
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
                            <div className="text-right flex items-center gap-2">
                              <div>
                                <div className="text-lg font-semibold">
                                  {inv.quantity} {inv.unit}
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  {inv.items?.id && bestPrices[inv.items.id] && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge className="bg-green-600 cursor-help text-xs">
                                          ${bestPrices[inv.items.id].pricePerUnit.toFixed(2)}/{bestPrices[inv.items.id].displayUnit}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Best at {bestPrices[inv.items.id].storeName}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
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
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                onClick={() => inv.items?.id && addToShoppingList(inv.items.id)}
                                title="Add to shopping list"
                              >
                                🛒+
                              </Button>
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

      {/* Needs Restocking Section */}
      {depletedItems.length > 0 && (
        <div className="max-w-lg mx-auto mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span aria-hidden="true">📝</span> Needs Restocking ({depletedItems.length})
            </h2>
            <button
              onClick={() => setShowRestockList(!showRestockList)}
              className="text-sm text-amber-600 hover:underline"
            >
              {showRestockList ? 'Hide' : 'Show'}
            </button>
          </div>

          {showRestockList && (
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
              <CardContent className="py-4">
                <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                  These items are depleted and may need to be purchased:
                </p>
                <div className="space-y-2">
                  {depletedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2 px-3 bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-700"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg" aria-hidden="true">🛒</span>
                        <span className="font-medium dark:text-gray-100">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {bestPrices[item.id] && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge className="bg-green-600 cursor-help text-xs">
                                ${bestPrices[item.id].pricePerUnit.toFixed(2)}/{bestPrices[item.id].displayUnit}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Best at {bestPrices[item.id].storeName}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {item.category && (
                          <Badge variant="outline" className="text-xs">
                            {item.category}
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40 h-8 px-2"
                          onClick={() => addToShoppingList(item.id)}
                          title="Add to shopping list"
                        >
                          + List
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Shopping List Section */}
      <div className="max-w-lg mx-auto mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span aria-hidden="true">🛒</span> Shopping List ({shoppingList.length})
          </h2>
          <div className="flex items-center gap-2">
            {shoppingList.some(item => item.is_checked) && (
              <button
                onClick={clearCheckedItems}
                className="text-sm text-red-600 hover:underline"
              >
                Clear checked
              </button>
            )}
            <button
              onClick={() => setShowShoppingList(!showShoppingList)}
              className="text-sm text-amber-600 hover:underline"
            >
              {showShoppingList ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {showShoppingList && (
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700">
            <CardContent className="py-4">
              {/* Add new item form */}
              <form onSubmit={handleAddCustomItem} className="flex gap-2 mb-4">
                <Input
                  placeholder="Add item to list..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="flex-1 bg-white dark:bg-gray-800"
                />
                <Button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600"
                  disabled={addingItem || !newItemName.trim()}
                >
                  Add
                </Button>
              </form>

              {shoppingList.length === 0 ? (
                <p className="text-sm text-blue-800 dark:text-blue-200 text-center py-4">
                  Your shopping list is empty. Add items above or from your inventory!
                </p>
              ) : (
                <div className="space-y-2">
                  {shoppingList.map((item) => {
                    const itemName = item.items?.name || item.custom_name || 'Unknown Item'
                    const itemId = item.items?.id || item.item_id

                    return (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between py-2 px-3 rounded-lg border transition-colors ${
                          item.is_checked
                            ? 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 opacity-60'
                            : 'bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={item.is_checked}
                            onCheckedChange={() => toggleChecked(item.id, item.is_checked)}
                          />
                          <span className={`font-medium dark:text-gray-100 ${item.is_checked ? 'line-through' : ''}`}>
                            {itemName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {itemId && bestPrices[itemId] && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className="bg-green-600 cursor-help text-xs">
                                  ${bestPrices[itemId].pricePerUnit.toFixed(2)}/{bestPrices[itemId].displayUnit}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                Best at {bestPrices[itemId].storeName}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 h-8 w-8 p-0"
                            onClick={() => removeFromShoppingList(item.id)}
                            title="Remove from list"
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Receipt Scanner Wizard */}
      {showReceiptWizard && userId && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
            <div className="text-white">Loading scanner...</div>
          </div>
        }>
          <ReceiptWizard
            householdId={householdId}
            userId={userId}
            shoppingList={shoppingList}
            stores={stores}
            items={allItems}
            inventory={inventoryForWizard}
            storageUnits={storageUnits}
            onComplete={() => {
              setShowReceiptWizard(false)
              router.refresh()
            }}
            onCancel={() => setShowReceiptWizard(false)}
          />
        </Suspense>
      )}
    </div>
  )
}
