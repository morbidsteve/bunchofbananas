'use client'

import { useState } from 'react'
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

interface InventoryItem {
  id: string
  quantity: number
  unit: string
  expiration_date: string | null
  notes: string | null
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

interface InventoryListProps {
  inventory: InventoryItem[]
  items: Item[]
  storageUnits: StorageUnit[]
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
  householdId,
  userId,
}: InventoryListProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    itemId: '',
    newItemName: '',
    newItemCategory: '',
    shelfId: '',
    quantity: '1',
    unit: 'count',
    expirationDate: '',
  })

  const [isNewItem, setIsNewItem] = useState(false)

  const filteredInventory = inventory.filter((inv) =>
    inv.items?.name.toLowerCase().includes(search.toLowerCase()) ||
    inv.items?.category?.toLowerCase().includes(search.toLowerCase()) ||
    inv.shelves?.storage_units?.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleAddInventory(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    let itemId = formData.itemId

    // Create new item if needed
    if (isNewItem && formData.newItemName) {
      const { data: newItem, error: itemError } = await supabase
        .from('items')
        .insert({
          household_id: householdId,
          name: formData.newItemName,
          category: formData.newItemCategory || null,
          default_unit: formData.unit,
        })
        .select()
        .single()

      if (itemError) {
        setLoading(false)
        return
      }
      itemId = newItem.id
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
      setDialogOpen(false)
      setFormData({
        itemId: '',
        newItemName: '',
        newItemCategory: '',
        shelfId: '',
        quantity: '1',
        unit: 'count',
        expirationDate: '',
      })
      setIsNewItem(false)
      router.refresh()
    }

    setLoading(false)
  }

  async function handleRemoveItem(inventoryId: string) {
    const supabase = createClient()
    await supabase.from('inventory').delete().eq('id', inventoryId)
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

      {/* Search */}
      <div>
        <Input
          placeholder="Search items, categories, or storage..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
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
          {filteredInventory.map((inv) => (
            <Card key={inv.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-2xl">
                      {typeIcons[inv.shelves?.storage_units?.type || 'other']}
                    </div>
                    <div>
                      <div className="font-medium">{inv.items?.name}</div>
                      <div className="text-sm text-gray-500">
                        {inv.quantity} {inv.unit} • {inv.shelves?.storage_units?.name} - {inv.shelves?.name}
                      </div>
                      {inv.items?.category && (
                        <Badge variant="outline" className="mt-1">
                          {inv.items.category}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getExpirationBadge(inv.expiration_date)}
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
          ))}
        </div>
      )}
    </div>
  )
}
