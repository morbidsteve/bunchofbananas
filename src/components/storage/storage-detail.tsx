'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Item {
  id: string
  name: string
  category: string | null
  default_unit: string | null
}

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
}

interface Shelf {
  id: string
  name: string
  position: number
  inventory: InventoryItem[]
}

interface StorageUnit {
  id: string
  name: string
  type: string
  location: string | null
  shelves: Shelf[]
}

interface StorageDetailProps {
  storageUnit: StorageUnit
  householdId: string
  userId: string
  items: Item[]
}

const typeIcons: Record<string, string> = {
  fridge: '🧊',
  freezer: '❄️',
  pantry: '🗄️',
  cabinet: '🚪',
  other: '📦',
}

// Sortable shelf card wrapper component
function SortableShelfCard({
  shelf,
  headerContent,
  children,
}: {
  shelf: Shelf
  headerContent: React.ReactNode
  children: React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shelf.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={isDragging ? 'ring-2 ring-amber-500' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1"
                {...attributes}
                {...listeners}
                aria-label={`Drag to reorder ${shelf.name}`}
              >
                ⋮⋮
              </button>
              <CardTitle className="text-lg">{shelf.name}</CardTitle>
            </div>
            {headerContent}
          </div>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}

export function StorageDetail({ storageUnit, householdId, userId, items }: StorageDetailProps) {
  const router = useRouter()
  const [shelfDialogOpen, setShelfDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false)
  const [selectedShelfId, setSelectedShelfId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [shelfName, setShelfName] = useState('')

  // Local state for shelf order (for optimistic updates during drag)
  const [orderedShelves, setOrderedShelves] = useState(storageUnit.shelves)

  // Keep local state in sync with prop changes
  useEffect(() => {
    setOrderedShelves(storageUnit.shelves)
  }, [storageUnit.shelves])

  // DnD Kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Handle drag end - update shelf positions
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = orderedShelves.findIndex((s) => s.id === active.id)
      const newIndex = orderedShelves.findIndex((s) => s.id === over.id)

      // Optimistically update UI
      const newOrder = arrayMove(orderedShelves, oldIndex, newIndex)
      setOrderedShelves(newOrder)

      // Update positions in database
      const supabase = createClient()
      const updates = newOrder.map((shelf, index) => ({
        id: shelf.id,
        position: index + 1,
        storage_unit_id: storageUnit.id,
        name: shelf.name,
      }))

      const { error } = await supabase
        .from('shelves')
        .upsert(updates, { onConflict: 'id' })

      if (error) {
        toast.error('Failed to reorder shelves')
        // Revert on error
        setOrderedShelves(storageUnit.shelves)
      } else {
        toast.success('Shelf order updated')
        router.refresh()
      }
    }
  }
  const [addItemForm, setAddItemForm] = useState({
    itemId: '',
    newItemName: '',
    newItemCategory: '',
    quantity: '1',
    unit: 'count',
    expirationDate: '',
    price: '',
    storeName: '',
    packageSize: '',
    packageUnit: '',
  })
  const [isNewItem, setIsNewItem] = useState(false)

  // Edit storage unit state
  const [editStorageDialogOpen, setEditStorageDialogOpen] = useState(false)
  const [editStorageForm, setEditStorageForm] = useState({
    name: storageUnit.name,
    type: storageUnit.type,
    location: storageUnit.location || '',
  })

  // Edit shelf state
  const [editShelfDialogOpen, setEditShelfDialogOpen] = useState(false)
  const [editingShelf, setEditingShelf] = useState<Shelf | null>(null)
  const [editShelfName, setEditShelfName] = useState('')

  async function handleAddShelf(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const nextPosition = storageUnit.shelves.length + 1

    const { error } = await supabase
      .from('shelves')
      .insert({
        storage_unit_id: storageUnit.id,
        name: shelfName,
        position: nextPosition,
      })

    if (!error) {
      setShelfDialogOpen(false)
      setShelfName('')
      router.refresh()
    }

    setLoading(false)
  }

  async function handleDeleteStorage() {
    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('storage_units')
      .delete()
      .eq('id', storageUnit.id)

    if (!error) {
      router.push('/dashboard/storage')
    }
    setLoading(false)
  }

  async function handleDeleteShelf(shelfId: string) {
    const supabase = createClient()

    const { error } = await supabase
      .from('shelves')
      .delete()
      .eq('id', shelfId)

    if (!error) {
      router.refresh()
    }
  }

  async function handleEditStorage(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()

    const { error } = await supabase
      .from('storage_units')
      .update({
        name: editStorageForm.name,
        type: editStorageForm.type,
        location: editStorageForm.location || null,
      })
      .eq('id', storageUnit.id)

    if (error) {
      toast.error('Failed to update storage unit')
    } else {
      toast.success('Storage unit updated')
      setEditStorageDialogOpen(false)
      router.refresh()
    }

    setLoading(false)
  }

  function openEditShelfDialog(shelf: Shelf) {
    setEditingShelf(shelf)
    setEditShelfName(shelf.name)
    setEditShelfDialogOpen(true)
  }

  async function handleEditShelf(e: React.FormEvent) {
    e.preventDefault()
    if (!editingShelf) return

    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('shelves')
      .update({ name: editShelfName })
      .eq('id', editingShelf.id)

    if (error) {
      toast.error('Failed to update shelf')
    } else {
      toast.success('Shelf updated')
      setEditShelfDialogOpen(false)
      setEditingShelf(null)
      router.refresh()
    }

    setLoading(false)
  }

  async function handleQuantityChange(inv: InventoryItem, delta: number) {
    if (!inv.items) return

    setUpdatingId(inv.id)
    const supabase = createClient()
    const newQuantity = Math.max(0, inv.quantity + delta)

    const { error } = await supabase
      .from('inventory')
      .update({ quantity: newQuantity })
      .eq('id', inv.id)

    if (error) {
      toast.error('Failed to update quantity')
    } else {
      // Log the change
      const action = delta > 0 ? 'added' : 'used'
      await supabase.from('inventory_log').insert({
        inventory_id: inv.id,
        item_id: inv.items.id,
        action,
        quantity_change: delta,
        performed_by: userId,
        notes: delta > 0 ? 'Added via storage view' : 'Used via storage view',
      })

      if (newQuantity === 0) {
        toast.success(`${inv.items.name} is now depleted`)
      } else {
        toast.success(`${inv.items.name}: ${inv.quantity} → ${newQuantity} ${inv.unit}`)
      }
      router.refresh()
    }

    setUpdatingId(null)
  }

  function openAddItemDialog(shelfId: string) {
    setSelectedShelfId(shelfId)
    setAddItemForm({
      itemId: '',
      newItemName: '',
      newItemCategory: '',
      quantity: '1',
      unit: 'count',
      expirationDate: '',
      price: '',
      storeName: '',
      packageSize: '',
      packageUnit: '',
    })
    setIsNewItem(false)
    setAddItemDialogOpen(true)
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedShelfId) return
    setLoading(true)

    const supabase = createClient()
    let itemId = addItemForm.itemId

    // Create new item if needed
    if (isNewItem && addItemForm.newItemName) {
      const { data: newItem, error: itemError } = await supabase
        .from('items')
        .insert({
          household_id: householdId,
          name: addItemForm.newItemName,
          category: addItemForm.newItemCategory || null,
          default_unit: addItemForm.unit,
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

    // Add to inventory
    const { error } = await supabase
      .from('inventory')
      .insert({
        item_id: itemId,
        shelf_id: selectedShelfId,
        quantity: parseFloat(addItemForm.quantity),
        unit: addItemForm.unit,
        expiration_date: addItemForm.expirationDate || null,
        added_by: userId,
      })

    if (error) {
      toast.error('Failed to add item')
    } else {
      // Save price history if price was entered
      if (addItemForm.price && parseFloat(addItemForm.price) > 0) {
        let storeId: string | null = null

        // Create or find store if name was provided
        if (addItemForm.storeName.trim()) {
          // Check if store exists
          const { data: existingStore } = await supabase
            .from('stores')
            .select('id')
            .eq('household_id', householdId)
            .ilike('name', addItemForm.storeName.trim())
            .single()

          if (existingStore) {
            storeId = existingStore.id
          } else {
            // Create new store
            const { data: newStore } = await supabase
              .from('stores')
              .insert({
                household_id: householdId,
                name: addItemForm.storeName.trim(),
              })
              .select('id')
              .single()

            if (newStore) {
              storeId = newStore.id
            }
          }
        }

        // Add price history record
        await supabase.from('price_history').insert({
          item_id: itemId,
          store_id: storeId,
          price: parseFloat(addItemForm.price),
          quantity: parseFloat(addItemForm.quantity),
          unit: addItemForm.unit,
          package_size: addItemForm.packageSize ? parseFloat(addItemForm.packageSize) : null,
          package_unit: addItemForm.packageUnit || null,
          recorded_by: userId,
        })
      }

      const itemName = isNewItem ? addItemForm.newItemName : items.find(i => i.id === itemId)?.name
      toast.success(`Added ${itemName}`)
      setAddItemDialogOpen(false)
      router.refresh()
    }

    setLoading(false)
  }

  const totalItems = storageUnit.shelves.reduce(
    (acc, shelf) => acc + shelf.inventory.length,
    0
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/dashboard/storage" className="hover:underline">
              Storage
            </Link>
            <span>/</span>
            <span>{storageUnit.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-4xl">{typeIcons[storageUnit.type]}</span>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{storageUnit.name}</h1>
              {storageUnit.location && (
                <p className="text-gray-600">{storageUnit.location}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditStorageDialogOpen(true)}>
            Edit
          </Button>
          <Dialog open={shelfDialogOpen} onOpenChange={setShelfDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600">
                + Add Shelf
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Shelf</DialogTitle>
                <DialogDescription>
                  Add a new shelf to {storageUnit.name}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddShelf} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="shelfName">Shelf Name</Label>
                  <Input
                    id="shelfName"
                    value={shelfName}
                    onChange={(e) => setShelfName(e.target.value)}
                    placeholder="Top Shelf, Crisper Drawer, etc."
                    required
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShelfDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={loading}>
                    {loading ? 'Adding...' : 'Add Shelf'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-red-600 hover:bg-red-50">
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {storageUnit.name}?</DialogTitle>
                <DialogDescription>
                  This will permanently delete this storage unit and all its shelves.
                  {totalItems > 0 && ` ${totalItems} items will also be removed from inventory.`}
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteStorage}
                  disabled={loading}
                >
                  {loading ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{storageUnit.shelves.length}</div>
            <p className="text-sm text-gray-600">Shelves</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalItems}</div>
            <p className="text-sm text-gray-600">Items</p>
          </CardContent>
        </Card>
      </div>

      {/* Shelves */}
      {storageUnit.shelves.length === 0 ? (
        <Card className="bg-gray-50">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="text-4xl mb-4">📚</div>
              <h3 className="text-lg font-semibold mb-2">No shelves yet</h3>
              <p className="text-gray-600 mb-4">
                Add shelves to organize items in this {storageUnit.type}.
              </p>
              <Button
                onClick={() => setShelfDialogOpen(true)}
                className="bg-amber-500 hover:bg-amber-600"
              >
                Add First Shelf
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedShelves.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {orderedShelves.map((shelf) => (
                <SortableShelfCard
                  key={shelf.id}
                  shelf={shelf}
                  headerContent={
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {shelf.inventory.length} items
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label={`Options for ${shelf.name}`}>
                            ⋮
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditShelfDialog(shelf)}>
                            Edit Shelf
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDeleteShelf(shelf.id)}
                          >
                            Delete Shelf
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  }
                >
                  {shelf.inventory.length === 0 ? (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500 italic">No items on this shelf</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAddItemDialog(shelf.id)}
                      >
                        + Add Item
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {shelf.inventory.map((inv) => {
                        const isDepleted = inv.quantity === 0
                        const isUpdating = updatingId === inv.id

                        return (
                          <div
                            key={inv.id}
                            className={`flex items-center justify-between p-2 rounded ${isDepleted ? 'bg-gray-100 opacity-60' : 'bg-gray-50'}`}
                          >
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{inv.items?.name}</span>
                              {inv.items?.category && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  {inv.items.category}
                                </Badge>
                              )}
                              {inv.expiration_date && (
                                <Badge
                                  variant={
                                    new Date(inv.expiration_date) <= new Date()
                                      ? 'destructive'
                                      : 'secondary'
                                  }
                                  className="ml-2"
                                >
                                  Exp: {new Date(inv.expiration_date).toLocaleDateString()}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleQuantityChange(inv, -1)}
                                disabled={isUpdating || isDepleted}
                                aria-label={`Decrease quantity of ${inv.items?.name}`}
                              >
                                -
                              </Button>
                              <div className="w-14 text-center">
                                <div className="font-semibold">{inv.quantity}</div>
                                <div className="text-xs text-gray-500">{inv.unit}</div>
                              </div>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleQuantityChange(inv, 1)}
                                disabled={isUpdating}
                                aria-label={`Increase quantity of ${inv.items?.name}`}
                              >
                                +
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 text-amber-600 hover:bg-amber-50"
                        onClick={() => openAddItemDialog(shelf.id)}
                      >
                        + Add Item to {shelf.name}
                      </Button>
                    </div>
                  )}
                </SortableShelfCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}


      {/* Add Item Dialog */}
      <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Item to Shelf</DialogTitle>
            <DialogDescription>
              Add an existing item or create a new one
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddItem} className="space-y-4">
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
                    value={addItemForm.newItemName}
                    onChange={(e) => setAddItemForm({ ...addItemForm, newItemName: e.target.value })}
                    placeholder="Organic Milk"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category (optional)</Label>
                  <Input
                    id="category"
                    value={addItemForm.newItemCategory}
                    onChange={(e) => setAddItemForm({ ...addItemForm, newItemCategory: e.target.value })}
                    placeholder="Dairy, Produce, etc."
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>Select Item</Label>
                <Select
                  value={addItemForm.itemId}
                  onValueChange={(value) => setAddItemForm({ ...addItemForm, itemId: value })}
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

            {/* Quantity */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={addItemForm.quantity}
                  onChange={(e) => setAddItemForm({ ...addItemForm, quantity: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select
                  value={addItemForm.unit}
                  onValueChange={(value) => setAddItemForm({ ...addItemForm, unit: value })}
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
                value={addItemForm.expirationDate}
                onChange={(e) => setAddItemForm({ ...addItemForm, expirationDate: e.target.value })}
              />
            </div>

            {/* Price Section */}
            <div className="border-t pt-4 mt-4">
              <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 block">
                Price Info (optional)
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Price Paid ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={addItemForm.price}
                    onChange={(e) => setAddItemForm({ ...addItemForm, price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storeName">Store</Label>
                  <Input
                    id="storeName"
                    value={addItemForm.storeName}
                    onChange={(e) => setAddItemForm({ ...addItemForm, storeName: e.target.value })}
                    placeholder="Costco, Walmart..."
                  />
                </div>
              </div>

              {/* Package size for price-per-unit calculation */}
              {addItemForm.price && (
                <div className="mt-3">
                  <Label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">
                    Package size (for price per oz/lb calculation)
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={addItemForm.packageSize}
                        onChange={(e) => setAddItemForm({ ...addItemForm, packageSize: e.target.value })}
                        placeholder="16"
                      />
                    </div>
                    <Select
                      value={addItemForm.packageUnit}
                      onValueChange={(value) => setAddItemForm({ ...addItemForm, packageUnit: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="oz">oz</SelectItem>
                        <SelectItem value="fl_oz">fl oz</SelectItem>
                        <SelectItem value="lb">lb</SelectItem>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="ml">ml</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="gallon">gallon</SelectItem>
                        <SelectItem value="count">count</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setAddItemDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-amber-500 hover:bg-amber-600"
                disabled={loading || (!isNewItem && !addItemForm.itemId)}
              >
                {loading ? 'Adding...' : 'Add to Shelf'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Storage Unit Dialog */}
      <Dialog open={editStorageDialogOpen} onOpenChange={setEditStorageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Storage Unit</DialogTitle>
            <DialogDescription>
              Update the name, type, or location
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditStorage} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Name</Label>
              <Input
                id="editName"
                value={editStorageForm.name}
                onChange={(e) => setEditStorageForm({ ...editStorageForm, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editType">Type</Label>
              <Select
                value={editStorageForm.type}
                onValueChange={(value) => setEditStorageForm({ ...editStorageForm, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fridge">Refrigerator</SelectItem>
                  <SelectItem value="freezer">Freezer</SelectItem>
                  <SelectItem value="pantry">Pantry</SelectItem>
                  <SelectItem value="cabinet">Cabinet</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editLocation">Location (optional)</Label>
              <Input
                id="editLocation"
                value={editStorageForm.location}
                onChange={(e) => setEditStorageForm({ ...editStorageForm, location: e.target.value })}
                placeholder="Kitchen, Garage, etc."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setEditStorageDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Shelf Dialog */}
      <Dialog open={editShelfDialogOpen} onOpenChange={setEditShelfDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Shelf</DialogTitle>
            <DialogDescription>
              Update the shelf name
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditShelf} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editShelfName">Shelf Name</Label>
              <Input
                id="editShelfName"
                value={editShelfName}
                onChange={(e) => setEditShelfName(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setEditShelfDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
