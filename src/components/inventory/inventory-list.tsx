'use client'

import { useState, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

// Lazy load the barcode scanner to avoid SSR issues
const BarcodeScanner = lazy(() =>
  import('@/components/scanner/barcode-scanner').then(mod => ({ default: mod.BarcodeScanner }))
)

interface InventoryItem {
  id: string
  quantity: number
  unit: string
  expiration_date: string | null
  notes: string | null
  priority: 'normal' | 'use_soon' | 'urgent'
  condition_notes: string | null
  added_at: string
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

interface Item {
  id: string
  name: string
  category: string | null
  default_unit: string | null
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

interface Store {
  id: string
  name: string
  location: string | null
}

interface InventoryListProps {
  inventory: InventoryItem[]
  items: Item[]
  storageUnits: StorageUnit[]
  stores: Store[]
  householdId: string
  userId: string
}

const typeIcons: Record<string, string> = {
  fridge: '🧊',
  freezer: '❄️',
  pantry: '🗄️',
  cabinet: '🚪',
  other: '📦',
}

export function InventoryList({
  inventory,
  items,
  storageUnits,
  stores,
  householdId,
  userId,
}: InventoryListProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false)
  const [selectedInventory, setSelectedInventory] = useState<InventoryItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [showDepleted, setShowDepleted] = useState(false)
  const [showPriorityOnly, setShowPriorityOnly] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [addAnother, setAddAnother] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [lookingUpBarcode, setLookingUpBarcode] = useState(false)
  const [scannedBarcode, setScannedBarcode] = useState('')
  const [priorityForm, setPriorityForm] = useState({
    priority: 'normal' as 'normal' | 'use_soon' | 'urgent',
    conditionNotes: '',
  })

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingInventory, setEditingInventory] = useState<InventoryItem | null>(null)
  const [editForm, setEditForm] = useState({
    itemName: '',
    itemCategory: '',
    quantity: '',
    unit: '',
    shelfId: '',
    expirationDate: '',
  })

  const [formData, setFormData] = useState({
    itemId: '',
    newItemName: '',
    newItemCategory: '',
    shelfId: '',
    quantity: '1',
    unit: 'count',
    expirationDate: '',
    storeId: '',
    newStoreName: '',
    price: '',
  })

  const [isNewItem, setIsNewItem] = useState(false)

  const filteredInventory = inventory.filter((inv) => {
    // Filter by search
    const matchesSearch = inv.items?.name.toLowerCase().includes(search.toLowerCase()) ||
      inv.items?.category?.toLowerCase().includes(search.toLowerCase()) ||
      inv.shelves?.storage_units?.name.toLowerCase().includes(search.toLowerCase())

    // Filter by quantity (show depleted or not)
    const matchesQuantityFilter = showDepleted ? true : inv.quantity > 0

    // Filter by priority
    const matchesPriorityFilter = showPriorityOnly ? inv.priority !== 'normal' : true

    return matchesSearch && matchesQuantityFilter && matchesPriorityFilter
  })

  // Count of depleted items
  const depletedCount = inventory.filter((inv) => inv.quantity === 0).length

  // Count of priority items
  const priorityCount = inventory.filter((inv) => inv.priority !== 'normal' && inv.quantity > 0).length

  async function handleAddInventory(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    let itemId = formData.itemId
    let storeId = formData.storeId

    // Create new item if needed
    if (isNewItem && formData.newItemName) {
      const { data: newItem, error: itemError } = await supabase
        .from('items')
        .insert({
          household_id: householdId,
          name: formData.newItemName,
          category: formData.newItemCategory || null,
          default_unit: formData.unit,
          barcode: scannedBarcode || null,
        })
        .select()
        .single()

      if (itemError) {
        toast.error('Failed to create item')
        setLoading(false)
        return
      }
      itemId = newItem.id
    }

    // Create new store if needed
    if (formData.newStoreName && !formData.storeId) {
      const { data: newStore, error: storeError } = await supabase
        .from('stores')
        .insert({
          household_id: householdId,
          name: formData.newStoreName,
        })
        .select()
        .single()

      if (!storeError && newStore) {
        storeId = newStore.id
      }
    }

    // Add to inventory
    const { error } = await supabase
      .from('inventory')
      .insert({
        item_id: itemId,
        shelf_id: formData.shelfId,
        quantity: parseFloat(formData.quantity),
        unit: formData.unit,
        expiration_date: formData.expirationDate || null,
        added_by: userId,
      })

    if (!error) {
      // Record price history if price was provided
      if (formData.price && storeId) {
        await supabase.from('price_history').insert({
          item_id: itemId,
          store_id: storeId,
          price: parseFloat(formData.price),
          quantity: parseFloat(formData.quantity),
          unit: formData.unit,
          recorded_by: userId,
        })
      }

      const itemName = isNewItem ? formData.newItemName : items.find(i => i.id === itemId)?.name
      toast.success(`Added ${itemName} to inventory`)

      if (addAnother) {
        // Reset only item-specific fields, keep shelf and store for convenience
        setFormData({
          itemId: '',
          newItemName: '',
          newItemCategory: '',
          shelfId: formData.shelfId, // Keep the shelf selection
          quantity: '1',
          unit: 'count',
          expirationDate: '',
          storeId: formData.storeId, // Keep store selection
          newStoreName: '',
          price: '',
        })
        setIsNewItem(false)
        setScannedBarcode('')
      } else {
        setDialogOpen(false)
        setFormData({
          itemId: '',
          newItemName: '',
          newItemCategory: '',
          shelfId: '',
          quantity: '1',
          unit: 'count',
          expirationDate: '',
          storeId: '',
          newStoreName: '',
          price: '',
        })
        setIsNewItem(false)
        setScannedBarcode('')
      }
      router.refresh()
    } else {
      toast.error('Failed to add item')
    }

    setLoading(false)
  }

  async function handleRemoveItem(inventoryId: string) {
    const supabase = createClient()
    await supabase.from('inventory').delete().eq('id', inventoryId)
    router.refresh()
  }

  async function handleQuantityChange(inv: InventoryItem, delta: number) {
    if (!inv.items) return

    setUpdatingId(inv.id)
    const supabase = createClient()
    const newQuantity = Math.max(0, inv.quantity + delta)

    // Update inventory quantity
    const { error: updateError } = await supabase
      .from('inventory')
      .update({ quantity: newQuantity })
      .eq('id', inv.id)

    if (updateError) {
      toast.error('Failed to update quantity')
      setUpdatingId(null)
      return
    }

    // Log the change
    const action = delta > 0 ? 'added' : 'used'
    await supabase.from('inventory_log').insert({
      inventory_id: inv.id,
      item_id: inv.items.id,
      action,
      quantity_change: delta,
      performed_by: userId,
      notes: delta > 0 ? 'Added via quick add' : 'Used via quick subtract',
    })

    if (newQuantity === 0) {
      toast.success(`${inv.items.name} is now depleted`)
    } else {
      toast.success(`${inv.items.name}: ${inv.quantity} → ${newQuantity} ${inv.unit}`)
    }

    setUpdatingId(null)
    router.refresh()
  }

  function openPriorityDialog(inv: InventoryItem) {
    setSelectedInventory(inv)
    setPriorityForm({
      priority: inv.priority || 'normal',
      conditionNotes: inv.condition_notes || '',
    })
    setPriorityDialogOpen(true)
  }

  async function handleSetPriority(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedInventory) return

    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('inventory')
      .update({
        priority: priorityForm.priority,
        condition_notes: priorityForm.conditionNotes || null,
      })
      .eq('id', selectedInventory.id)

    if (error) {
      toast.error('Failed to update priority')
    } else {
      const priorityLabels = { normal: 'Normal', use_soon: 'Use Soon', urgent: 'Urgent' }
      toast.success(`${selectedInventory.items?.name} marked as ${priorityLabels[priorityForm.priority]}`)
      setPriorityDialogOpen(false)
      router.refresh()
    }

    setLoading(false)
  }

  async function handleBarcodeScan(barcode: string) {
    setShowScanner(false)
    setLookingUpBarcode(true)
    setScannedBarcode(barcode)

    try {
      const response = await fetch(`/api/lookup/barcode?barcode=${encodeURIComponent(barcode)}`)
      const data = await response.json()

      if (data.found && data.product) {
        const product = data.product
        // Set form to new item mode and populate with scanned data
        setIsNewItem(true)
        setFormData({
          ...formData,
          newItemName: product.brand ? `${product.brand} ${product.name}` : product.name,
          newItemCategory: product.category || '',
          quantity: '1',
          unit: 'count',
        })
        setDialogOpen(true)
        toast.success(`Found: ${product.name}`)
      } else {
        // Product not found, open dialog with just the barcode
        setIsNewItem(true)
        setDialogOpen(true)
        toast.info('Product not in database. Please enter details manually.')
      }
    } catch {
      toast.error('Failed to lookup barcode')
      setIsNewItem(true)
      setDialogOpen(true)
    } finally {
      setLookingUpBarcode(false)
    }
  }

  async function handleRestockItem(inv: InventoryItem) {
    if (!inv.items) return

    setUpdatingId(inv.id)
    const supabase = createClient()

    // Restore to 1 if depleted
    const { error } = await supabase
      .from('inventory')
      .update({ quantity: 1 })
      .eq('id', inv.id)

    if (error) {
      toast.error('Failed to restock item')
      setUpdatingId(null)
      return
    }

    // Log the restock
    await supabase.from('inventory_log').insert({
      inventory_id: inv.id,
      item_id: inv.items.id,
      action: 'added',
      quantity_change: 1,
      performed_by: userId,
      notes: 'Restocked from depleted',
    })

    toast.success(`${inv.items.name} restocked`)
    setUpdatingId(null)
    router.refresh()
  }

  function openEditDialog(inv: InventoryItem) {
    setEditingInventory(inv)
    setEditForm({
      itemName: inv.items?.name || '',
      itemCategory: inv.items?.category || '',
      quantity: inv.quantity.toString(),
      unit: inv.unit,
      shelfId: inv.shelves?.id || '',
      expirationDate: inv.expiration_date || '',
    })
    setEditDialogOpen(true)
  }

  async function handleEditInventory(e: React.FormEvent) {
    e.preventDefault()
    if (!editingInventory || !editingInventory.items) return

    setLoading(true)
    const supabase = createClient()

    // Update item name and category if changed
    if (
      editForm.itemName !== editingInventory.items.name ||
      editForm.itemCategory !== (editingInventory.items.category || '')
    ) {
      const { error: itemError } = await supabase
        .from('items')
        .update({
          name: editForm.itemName,
          category: editForm.itemCategory || null,
        })
        .eq('id', editingInventory.items.id)

      if (itemError) {
        toast.error('Failed to update item')
        setLoading(false)
        return
      }
    }

    // Update inventory record
    const { error: invError } = await supabase
      .from('inventory')
      .update({
        quantity: parseFloat(editForm.quantity),
        unit: editForm.unit,
        shelf_id: editForm.shelfId,
        expiration_date: editForm.expirationDate || null,
      })
      .eq('id', editingInventory.id)

    if (invError) {
      toast.error('Failed to update inventory')
      setLoading(false)
      return
    }

    toast.success(`${editForm.itemName} updated`)
    setEditDialogOpen(false)
    setEditingInventory(null)
    setLoading(false)
    router.refresh()
  }

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

  const hasStorageUnits = storageUnits.length > 0
  const hasShelves = storageUnits.some((u) => u.shelves.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-600 mt-1">All items across your storage</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowScanner(true)}
            disabled={!hasShelves || lookingUpBarcode}
          >
            {lookingUpBarcode ? 'Looking up...' : '📷 Scan'}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-amber-500 hover:bg-amber-600"
                disabled={!hasShelves}
              >
                + Add Item
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Item to Inventory</DialogTitle>
              <DialogDescription>
                Add an existing item or create a new one
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddInventory} className="space-y-4">
              {/* Item Selection */}
              <div className="space-y-2">
                <Label>Item</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={!isNewItem ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setIsNewItem(false)}
                  >
                    Existing
                  </Button>
                  <Button
                    type="button"
                    variant={isNewItem ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setIsNewItem(true)}
                  >
                    New Item
                  </Button>
                </div>
              </div>

              {isNewItem ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="newItemName">Item Name</Label>
                    <Input
                      id="newItemName"
                      value={formData.newItemName}
                      onChange={(e) => setFormData({ ...formData, newItemName: e.target.value })}
                      placeholder="Organic Milk"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category (optional)</Label>
                    <Input
                      id="category"
                      value={formData.newItemCategory}
                      onChange={(e) => setFormData({ ...formData, newItemCategory: e.target.value })}
                      placeholder="Dairy, Produce, etc."
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label>Select Item</Label>
                  <Select
                    value={formData.itemId}
                    onValueChange={(value) => setFormData({ ...formData, itemId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an item" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} {item.category && `(${item.category})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {items.length === 0 && (
                    <p className="text-sm text-gray-500">No items yet. Create a new one!</p>
                  )}
                </div>
              )}

              {/* Location */}
              <div className="space-y-2">
                <Label>Location</Label>
                <Select
                  value={formData.shelfId}
                  onValueChange={(value) => setFormData({ ...formData, shelfId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose shelf" />
                  </SelectTrigger>
                  <SelectContent>
                    {storageUnits.map((unit) => (
                      <div key={unit.id}>
                        <div className="px-2 py-1 text-sm font-semibold text-gray-500">
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

              {/* Quantity */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit</Label>
                  <Select
                    value={formData.unit}
                    onValueChange={(value) => setFormData({ ...formData, unit: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="count">count</SelectItem>
                      <SelectItem value="lb">lb</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                      <SelectItem value="gallon">gallon</SelectItem>
                      <SelectItem value="liter">liter</SelectItem>
                      <SelectItem value="pack">pack</SelectItem>
                      <SelectItem value="bag">bag</SelectItem>
                      <SelectItem value="box">box</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Expiration */}
              <div className="space-y-2">
                <Label htmlFor="expiration">Expiration Date (optional)</Label>
                <Input
                  id="expiration"
                  type="date"
                  value={formData.expirationDate}
                  onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                />
              </div>

              {/* Purchase Location and Price (optional) */}
              <div className="border-t pt-4 mt-2">
                <p className="text-sm text-gray-500 mb-3">Purchase Info (optional)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Store</Label>
                    {stores.length > 0 ? (
                      <Select
                        value={formData.storeId || 'none'}
                        onValueChange={(value) => setFormData({ ...formData, storeId: value === 'none' ? '' : value, newStoreName: '' })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select store" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {stores.map((store) => (
                            <SelectItem key={store.id} value={store.id}>
                              {store.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        placeholder="Store name"
                        value={formData.newStoreName}
                        onChange={(e) => setFormData({ ...formData, newStoreName: e.target.value })}
                      />
                    )}
                    {stores.length > 0 && !formData.storeId && (
                      <Input
                        placeholder="Or enter new store"
                        value={formData.newStoreName}
                        onChange={(e) => setFormData({ ...formData, newStoreName: e.target.value, storeId: '' })}
                        className="mt-2"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price">Price ($)</Label>
                    <Input
                      id="price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Add Another Checkbox */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="addAnother"
                  checked={addAnother}
                  onChange={(e) => setAddAnother(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <Label htmlFor="addAnother" className="text-sm font-normal cursor-pointer">
                  Add another item after saving
                </Label>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600"
                  disabled={loading || (!isNewItem && !formData.itemId) || !formData.shelfId}
                >
                  {loading ? 'Adding...' : 'Add to Inventory'}
                </Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Barcode Scanner Modal */}
      {showScanner && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
            <div className="text-white">Loading scanner...</div>
          </div>
        }>
          <BarcodeScanner
            onScan={handleBarcodeScan}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
        <Input
          placeholder="Search items, categories, or storage..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <div className="flex gap-2 flex-wrap">
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
          {depletedCount > 0 && (
            <Button
              variant={showDepleted ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowDepleted(!showDepleted)}
              className="w-fit"
            >
              {showDepleted ? 'Hide' : 'Show'} depleted ({depletedCount})
            </Button>
          )}
        </div>
      </div>

      {/* No storage warning */}
      {!hasStorageUnits && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="pt-6">
            <p className="text-amber-800">
              You need to <a href="/dashboard/storage" className="underline font-medium">add a storage unit</a> with shelves before adding inventory items.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Inventory List */}
      {filteredInventory.length === 0 ? (
        <Card className="bg-gray-50">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="text-4xl mb-4">📦</div>
              <h3 className="text-lg font-semibold mb-2">
                {search ? 'No matching items' : 'No items in inventory'}
              </h3>
              <p className="text-gray-600">
                {search
                  ? 'Try a different search term'
                  : 'Add items to start tracking your inventory'
                }
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredInventory.map((inv) => {
            const isDepleted = inv.quantity === 0
            const isUpdating = updatingId === inv.id
            const hasPriority = inv.priority && inv.priority !== 'normal'

            return (
              <Card
                key={inv.id}
                className={`${isDepleted ? 'opacity-60 bg-gray-50' : ''} ${
                  inv.priority === 'urgent' ? 'border-red-300 bg-red-50' :
                  inv.priority === 'use_soon' ? 'border-orange-300 bg-orange-50' : ''
                }`}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="text-2xl flex-shrink-0">
                        {typeIcons[inv.shelves?.storage_units?.type || 'other']}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{inv.items?.name}</div>
                        <div className="text-sm text-gray-500">
                          {inv.shelves?.storage_units?.name} - {inv.shelves?.name}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {inv.items?.category && (
                            <Badge variant="outline">
                              {inv.items.category}
                            </Badge>
                          )}
                          {inv.priority === 'urgent' && (
                            <Badge className="bg-red-500">Urgent</Badge>
                          )}
                          {inv.priority === 'use_soon' && (
                            <Badge className="bg-orange-500">Use Soon</Badge>
                          )}
                          {getExpirationBadge(inv.expiration_date)}
                          {isDepleted && (
                            <Badge variant="secondary">Depleted</Badge>
                          )}
                        </div>
                        {inv.condition_notes && (
                          <p className="text-sm text-orange-700 mt-1 italic">
                            {inv.condition_notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!isDepleted && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openPriorityDialog(inv)}
                          className={hasPriority ? 'text-orange-600 hover:bg-orange-100' : 'text-gray-500'}
                          title="Set priority"
                        >
                          ⚡
                        </Button>
                      )}
                      {isDepleted ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestockItem(inv)}
                          disabled={isUpdating}
                          className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                        >
                          {isUpdating ? '...' : 'Restock'}
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-lg font-bold"
                            onClick={() => handleQuantityChange(inv, -1)}
                            disabled={isUpdating}
                          >
                            -
                          </Button>
                          <div className="w-16 text-center">
                            <div className="font-semibold">{inv.quantity}</div>
                            <div className="text-xs text-gray-500">{inv.unit}</div>
                          </div>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-lg font-bold"
                            onClick={() => handleQuantityChange(inv, 1)}
                            disabled={isUpdating}
                          >
                            +
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-600 hover:bg-gray-100"
                        onClick={() => openEditDialog(inv)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => handleRemoveItem(inv.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Priority Dialog */}
      <Dialog open={priorityDialogOpen} onOpenChange={setPriorityDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Priority</DialogTitle>
            <DialogDescription>
              Mark "{selectedInventory?.items?.name}" for attention
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSetPriority} className="space-y-4">
            <div className="space-y-2">
              <Label>Priority Level</Label>
              <Select
                value={priorityForm.priority}
                onValueChange={(value: 'normal' | 'use_soon' | 'urgent') =>
                  setPriorityForm({ ...priorityForm, priority: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="use_soon">Use Soon - needs to be used</SelectItem>
                  <SelectItem value="urgent">Urgent - use immediately</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="conditionNotes">Condition Notes (optional)</Label>
              <Input
                id="conditionNotes"
                value={priorityForm.conditionNotes}
                onChange={(e) => setPriorityForm({ ...priorityForm, conditionNotes: e.target.value })}
                placeholder="e.g., getting mushy, almost expired"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setPriorityDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-amber-500 hover:bg-amber-600"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Priority'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Inventory Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Inventory Item</DialogTitle>
            <DialogDescription>
              Update item details, quantity, or location
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditInventory} className="space-y-4">
            {/* Item Name */}
            <div className="space-y-2">
              <Label htmlFor="editItemName">Item Name</Label>
              <Input
                id="editItemName"
                value={editForm.itemName}
                onChange={(e) => setEditForm({ ...editForm, itemName: e.target.value })}
                required
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="editCategory">Category (optional)</Label>
              <Input
                id="editCategory"
                value={editForm.itemCategory}
                onChange={(e) => setEditForm({ ...editForm, itemCategory: e.target.value })}
                placeholder="Dairy, Produce, etc."
              />
            </div>

            {/* Quantity and Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editQuantity">Quantity</Label>
                <Input
                  id="editQuantity"
                  type="number"
                  min="0"
                  step="0.1"
                  value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editUnit">Unit</Label>
                <Select
                  value={editForm.unit}
                  onValueChange={(value) => setEditForm({ ...editForm, unit: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">count</SelectItem>
                    <SelectItem value="lb">lb</SelectItem>
                    <SelectItem value="oz">oz</SelectItem>
                    <SelectItem value="gallon">gallon</SelectItem>
                    <SelectItem value="liter">liter</SelectItem>
                    <SelectItem value="pack">pack</SelectItem>
                    <SelectItem value="bag">bag</SelectItem>
                    <SelectItem value="box">box</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                value={editForm.shelfId}
                onValueChange={(value) => setEditForm({ ...editForm, shelfId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose shelf" />
                </SelectTrigger>
                <SelectContent>
                  {storageUnits.map((unit) => (
                    <div key={unit.id}>
                      <div className="px-2 py-1 text-sm font-semibold text-gray-500">
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

            {/* Expiration Date */}
            <div className="space-y-2">
              <Label htmlFor="editExpiration">Expiration Date (optional)</Label>
              <Input
                id="editExpiration"
                type="date"
                value={editForm.expirationDate}
                onChange={(e) => setEditForm({ ...editForm, expirationDate: e.target.value })}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-amber-500 hover:bg-amber-600"
                disabled={loading || !editForm.itemName || !editForm.shelfId}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
