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
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

interface InventoryEntry {
  id: string
  quantity: number
  unit: string
  expiration_date: string | null
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

interface ItemWithInventory {
  id: string
  name: string
  category: string | null
  default_unit: string | null
  barcode: string | null
  created_at: string
  inventory: InventoryEntry[]
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

interface ItemsManagerProps {
  items: ItemWithInventory[]
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

export function ItemsManager({
  items,
  storageUnits,
  householdId,
  userId,
}: ItemsManagerProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [selectedItem, setSelectedItem] = useState<ItemWithInventory | null>(null)
  const [selectedInventory, setSelectedInventory] = useState<InventoryEntry | null>(null)

  const [editForm, setEditForm] = useState({
    name: '',
    category: '',
    default_unit: 'count',
    barcode: '',
  })

  const [moveForm, setMoveForm] = useState({
    shelfId: '',
  })

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.category?.toLowerCase().includes(search.toLowerCase())
  )

  function openEditDialog(item: ItemWithInventory) {
    setSelectedItem(item)
    setEditForm({
      name: item.name,
      category: item.category || '',
      default_unit: item.default_unit || 'count',
      barcode: item.barcode || '',
    })
    setEditDialogOpen(true)
  }

  function openMoveDialog(item: ItemWithInventory, inv: InventoryEntry) {
    setSelectedItem(item)
    setSelectedInventory(inv)
    setMoveForm({
      shelfId: inv.shelves?.id || '',
    })
    setMoveDialogOpen(true)
  }

  async function handleEditItem(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedItem) return

    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('items')
      .update({
        name: editForm.name,
        category: editForm.category || null,
        default_unit: editForm.default_unit,
        barcode: editForm.barcode || null,
      })
      .eq('id', selectedItem.id)

    if (error) {
      toast.error('Failed to update item')
    } else {
      toast.success('Item updated')
      setEditDialogOpen(false)
      router.refresh()
    }

    setLoading(false)
  }

  async function handleMoveInventory(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedItem || !selectedInventory) return

    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('inventory')
      .update({ shelf_id: moveForm.shelfId })
      .eq('id', selectedInventory.id)

    if (error) {
      toast.error('Failed to move item')
    } else {
      // Log the move
      await supabase.from('inventory_log').insert({
        inventory_id: selectedInventory.id,
        item_id: selectedItem.id,
        action: 'moved',
        quantity_change: 0,
        performed_by: userId,
        notes: 'Moved to new location',
      })

      toast.success('Item moved to new location')
      setMoveDialogOpen(false)
      router.refresh()
    }

    setLoading(false)
  }

  async function handleDeleteItem(item: ItemWithInventory) {
    if (!confirm(`Delete "${item.name}" and all its inventory entries? This cannot be undone.`)) {
      return
    }

    const supabase = createClient()
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', item.id)

    if (error) {
      toast.error('Failed to delete item')
    } else {
      toast.success('Item deleted')
      router.refresh()
    }
  }

  // Calculate total inventory for each item
  function getTotalQuantity(item: ItemWithInventory) {
    return item.inventory.reduce((sum, inv) => sum + inv.quantity, 0)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Items Catalog</h1>
          <p className="text-gray-600 mt-1">Manage your items and their locations</p>
        </div>
      </div>

      {/* Search */}
      <div>
        <Input
          placeholder="Search items by name or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600">{items.length}</div>
            <div className="text-sm text-gray-500">Total Items</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600">
              {items.filter(i => i.inventory.length > 0).length}
            </div>
            <div className="text-sm text-gray-500">In Stock</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600">
              {items.filter(i => i.inventory.length === 0 || getTotalQuantity(i) === 0).length}
            </div>
            <div className="text-sm text-gray-500">Out of Stock</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600">
              {new Set(items.map(i => i.category).filter(Boolean)).size}
            </div>
            <div className="text-sm text-gray-500">Categories</div>
          </CardContent>
        </Card>
      </div>

      {/* Items List */}
      {filteredItems.length === 0 ? (
        <Card className="bg-gray-50">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="text-4xl mb-4">📋</div>
              <h3 className="text-lg font-semibold mb-2">
                {search ? 'No matching items' : 'No items yet'}
              </h3>
              <p className="text-gray-600">
                {search
                  ? 'Try a different search term'
                  : 'Add items through the Inventory page'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const totalQty = getTotalQuantity(item)
            const isOutOfStock = item.inventory.length === 0 || totalQty === 0

            return (
              <Card key={item.id} className={isOutOfStock ? 'opacity-60 bg-gray-50' : ''}>
                <CardContent className="py-4">
                  <div className="flex flex-col gap-4">
                    {/* Item Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-lg">{item.name}</span>
                          {item.category && (
                            <Badge variant="outline">{item.category}</Badge>
                          )}
                          {isOutOfStock && (
                            <Badge variant="secondary">Out of Stock</Badge>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          Default unit: {item.default_unit || 'count'}
                          {item.barcode && ` • Barcode: ${item.barcode}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(item)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteItem(item)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>

                    {/* Inventory Locations */}
                    {item.inventory.length > 0 && (
                      <div className="border-t pt-3">
                        <div className="text-sm font-medium text-gray-500 mb-2">
                          Locations ({item.inventory.length})
                        </div>
                        <div className="space-y-2">
                          {item.inventory.map((inv) => (
                            <div
                              key={inv.id}
                              className="flex items-center justify-between bg-gray-50 rounded-lg p-2"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-lg">
                                  {typeIcons[inv.shelves?.storage_units?.type || 'other']}
                                </span>
                                <div>
                                  <div className="text-sm font-medium">
                                    {inv.shelves?.storage_units?.name} - {inv.shelves?.name}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {inv.quantity} {inv.unit}
                                    {inv.expiration_date && (
                                      <span className="ml-2">
                                        Exp: {new Date(inv.expiration_date).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openMoveDialog(item, inv)}
                              >
                                Move
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Edit Item Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
            <DialogDescription>
              Update item details
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditItem} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Name</Label>
              <Input
                id="editName"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editCategory">Category</Label>
              <Input
                id="editCategory"
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                placeholder="Dairy, Produce, etc."
              />
            </div>
            <div className="space-y-2">
              <Label>Default Unit</Label>
              <Select
                value={editForm.default_unit}
                onValueChange={(value) => setEditForm({ ...editForm, default_unit: value })}
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
            <div className="space-y-2">
              <Label htmlFor="editBarcode">Barcode (optional)</Label>
              <Input
                id="editBarcode"
                value={editForm.barcode}
                onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                placeholder="UPC or EAN code"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Move Inventory Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Move Item</DialogTitle>
            <DialogDescription>
              Move "{selectedItem?.name}" to a new location
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMoveInventory} className="space-y-4">
            <div className="space-y-2">
              <Label>Current Location</Label>
              <div className="p-3 bg-gray-50 rounded-lg text-sm">
                {selectedInventory?.shelves?.storage_units?.name} - {selectedInventory?.shelves?.name}
              </div>
            </div>
            <div className="space-y-2">
              <Label>New Location</Label>
              <Select
                value={moveForm.shelfId}
                onValueChange={(value) => setMoveForm({ ...moveForm, shelfId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose new location" />
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
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setMoveDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-amber-500 hover:bg-amber-600"
                disabled={loading || !moveForm.shelfId || moveForm.shelfId === selectedInventory?.shelves?.id}
              >
                {loading ? 'Moving...' : 'Move Item'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
