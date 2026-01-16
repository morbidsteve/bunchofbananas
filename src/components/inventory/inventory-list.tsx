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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { celebrateSmall } from '@/lib/confetti'

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

interface InventoryListProps {
  inventory: InventoryItem[]
  items: Item[]
  storageUnits: StorageUnit[]
  stores: Store[]
  householdId: string
  userId: string
  bestPrices?: Record<string, BestPrice>
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
  bestPrices = {},
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

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null)

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Inline quantity edit state
  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(null)
  const [editingQuantityValue, setEditingQuantityValue] = useState('')

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
    // Price fields
    storeId: '',
    newStoreName: '',
    price: '',
    packageSize: '',
    packageUnit: '',
    onSale: false,
    priceHistoryId: '', // If editing existing price record
  })
  const [loadingPrice, setLoadingPrice] = useState(false)

  // Nutrition data from barcode scan
  const [scannedNutrition, setScannedNutrition] = useState<{
    calories: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
    fiber_g: number | null
    sugar_g: number | null
    sodium_mg: number | null
    nutriscore: string | null
  } | null>(null)

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
    packageSize: '',
    packageUnit: '',
  })

  // Manual nutrition input
  const [showNutritionFields, setShowNutritionFields] = useState(false)
  const [manualNutrition, setManualNutrition] = useState({
    calories: '',
    protein_g: '',
    carbs_g: '',
    fat_g: '',
    fiber_g: '',
    sugar_g: '',
    sodium_mg: '',
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
      // Use scanned nutrition if available, otherwise use manual input
      const nutritionData = scannedNutrition ? {
        calories: scannedNutrition.calories,
        protein_g: scannedNutrition.protein_g,
        carbs_g: scannedNutrition.carbs_g,
        fat_g: scannedNutrition.fat_g,
        fiber_g: scannedNutrition.fiber_g,
        sugar_g: scannedNutrition.sugar_g,
        sodium_mg: scannedNutrition.sodium_mg,
        nutriscore: scannedNutrition.nutriscore,
      } : (showNutritionFields ? {
        calories: manualNutrition.calories ? parseFloat(manualNutrition.calories) : null,
        protein_g: manualNutrition.protein_g ? parseFloat(manualNutrition.protein_g) : null,
        carbs_g: manualNutrition.carbs_g ? parseFloat(manualNutrition.carbs_g) : null,
        fat_g: manualNutrition.fat_g ? parseFloat(manualNutrition.fat_g) : null,
        fiber_g: manualNutrition.fiber_g ? parseFloat(manualNutrition.fiber_g) : null,
        sugar_g: manualNutrition.sugar_g ? parseFloat(manualNutrition.sugar_g) : null,
        sodium_mg: manualNutrition.sodium_mg ? parseFloat(manualNutrition.sodium_mg) : null,
      } : null)

      const { data: newItem, error: itemError } = await supabase
        .from('items')
        .insert({
          household_id: householdId,
          name: formData.newItemName,
          category: formData.newItemCategory || null,
          default_unit: formData.unit,
          barcode: scannedBarcode || null,
          ...(nutritionData && nutritionData),
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
        const priceData: Record<string, unknown> = {
          item_id: itemId,
          store_id: storeId,
          price: parseFloat(formData.price),
          quantity: parseFloat(formData.quantity),
          unit: formData.unit,
          recorded_by: userId,
        }
        // Add package size if provided for better price/oz calculations
        if (formData.packageSize && formData.packageUnit) {
          priceData.package_size = parseFloat(formData.packageSize)
          priceData.package_unit = formData.packageUnit
        }
        await supabase.from('price_history').insert(priceData)
      }

      const itemName = isNewItem ? formData.newItemName : items.find(i => i.id === itemId)?.name
      toast.success(`Added ${itemName} to inventory`)
      celebrateSmall()

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
          packageSize: '',
          packageUnit: '',
        })
        setIsNewItem(false)
        setScannedBarcode('')
        setScannedNutrition(null)
        setShowNutritionFields(false)
        setManualNutrition({ calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '', sugar_g: '', sodium_mg: '' })
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
          packageSize: '',
          packageUnit: '',
        })
        setIsNewItem(false)
        setScannedBarcode('')
        setScannedNutrition(null)
        setShowNutritionFields(false)
        setManualNutrition({ calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '', sugar_g: '', sodium_mg: '' })
      }
      router.refresh()
    } else {
      toast.error('Failed to add item')
    }

    setLoading(false)
  }

  function handleRemoveItem(inv: InventoryItem) {
    setDeletingItem(inv)
    setDeleteDialogOpen(true)
  }

  async function confirmDelete() {
    if (!deletingItem) return
    const supabase = createClient()
    await supabase.from('inventory').delete().eq('id', deletingItem.id)
    toast.success(`Removed ${deletingItem.items?.name || 'item'} from inventory`)
    setDeleteDialogOpen(false)
    setDeletingItem(null)
    router.refresh()
  }

  // Bulk selection functions
  function toggleItemSelection(id: string) {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredInventory.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredInventory.map(inv => inv.id)))
    }
  }

  async function confirmBulkDelete() {
    if (selectedIds.size === 0) return
    setBulkDeleting(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('inventory')
      .delete()
      .in('id', Array.from(selectedIds))

    if (error) {
      toast.error('Failed to delete some items')
    } else {
      toast.success(`Removed ${selectedIds.size} items from inventory`)
    }

    setSelectedIds(new Set())
    setBulkDeleteDialogOpen(false)
    setBulkDeleting(false)
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

  async function handleDirectQuantitySet(inv: InventoryItem, newQuantity: number) {
    if (!inv.items) return
    if (newQuantity === inv.quantity) {
      setEditingQuantityId(null)
      return
    }

    setUpdatingId(inv.id)
    const supabase = createClient()
    const clampedQuantity = Math.max(0, Math.floor(newQuantity))

    const { error: updateError } = await supabase
      .from('inventory')
      .update({ quantity: clampedQuantity })
      .eq('id', inv.id)

    if (updateError) {
      toast.error('Failed to update quantity')
      setUpdatingId(null)
      setEditingQuantityId(null)
      return
    }

    // Log the change
    const delta = clampedQuantity - inv.quantity
    const action = delta > 0 ? 'added' : 'used'
    await supabase.from('inventory_log').insert({
      inventory_id: inv.id,
      item_id: inv.items.id,
      action,
      quantity_change: delta,
      performed_by: userId,
      notes: 'Set via inline edit',
    })

    if (clampedQuantity === 0) {
      toast.success(`${inv.items.name} is now depleted`)
    } else {
      toast.success(`${inv.items.name}: ${inv.quantity} → ${clampedQuantity} ${inv.unit}`)
    }

    setUpdatingId(null)
    setEditingQuantityId(null)
    router.refresh()
  }

  function startInlineQuantityEdit(inv: InventoryItem) {
    setEditingQuantityId(inv.id)
    setEditingQuantityValue(inv.quantity.toString())
  }

  function handleInlineQuantityKeyDown(e: React.KeyboardEvent<HTMLInputElement>, inv: InventoryItem) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const newQty = parseInt(editingQuantityValue, 10)
      if (!isNaN(newQty)) {
        handleDirectQuantitySet(inv, newQty)
      } else {
        setEditingQuantityId(null)
      }
    } else if (e.key === 'Escape') {
      setEditingQuantityId(null)
    }
  }

  function handleInlineQuantityBlur(inv: InventoryItem) {
    const newQty = parseInt(editingQuantityValue, 10)
    if (!isNaN(newQty)) {
      handleDirectQuantitySet(inv, newQty)
    } else {
      setEditingQuantityId(null)
    }
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
    setScannedNutrition(null) // Reset nutrition data

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
        // Save nutrition data from barcode lookup
        if (product.nutrition) {
          setScannedNutrition({
            calories: product.nutrition.calories,
            protein_g: product.nutrition.protein_g,
            carbs_g: product.nutrition.carbs_g,
            fat_g: product.nutrition.fat_g,
            fiber_g: product.nutrition.fiber_g,
            sugar_g: product.nutrition.sugar_g,
            sodium_mg: product.nutrition.sodium_mg,
            nutriscore: product.nutriscore || null,
          })
        }
        setDialogOpen(true)
        const hasNutrition = product.nutrition?.calories != null
        toast.success(`Found: ${product.name}${hasNutrition ? ' (with nutrition info)' : ''}`)
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

  async function openEditDialog(inv: InventoryItem) {
    setEditingInventory(inv)
    setEditForm({
      itemName: inv.items?.name || '',
      itemCategory: inv.items?.category || '',
      quantity: inv.quantity.toString(),
      unit: inv.unit,
      shelfId: inv.shelves?.id || '',
      expirationDate: inv.expiration_date || '',
      // Reset price fields
      storeId: '',
      newStoreName: '',
      price: '',
      packageSize: '',
      packageUnit: '',
      onSale: false,
      priceHistoryId: '',
    })
    setEditDialogOpen(true)

    // Fetch the latest price for this item
    if (inv.items?.id) {
      setLoadingPrice(true)
      const supabase = createClient()
      const { data: latestPrice } = await supabase
        .from('price_history')
        .select('*, stores(name)')
        .eq('item_id', inv.items.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single()

      if (latestPrice) {
        setEditForm(prev => ({
          ...prev,
          storeId: latestPrice.store_id || '',
          price: latestPrice.price?.toString() || '',
          packageSize: latestPrice.package_size?.toString() || '',
          packageUnit: latestPrice.package_unit || '',
          onSale: latestPrice.on_sale || false,
          priceHistoryId: latestPrice.id,
        }))
      }
      setLoadingPrice(false)
    }
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

    // Handle price update/creation
    let storeId = editForm.storeId

    // Create new store if needed
    if (editForm.newStoreName && !editForm.storeId) {
      const { data: newStore, error: storeError } = await supabase
        .from('stores')
        .insert({
          household_id: householdId,
          name: editForm.newStoreName,
        })
        .select()
        .single()

      if (!storeError && newStore) {
        storeId = newStore.id
      }
    }

    // Save price history if price is provided
    if (editForm.price && storeId) {
      const priceData: Record<string, unknown> = {
        item_id: editingInventory.items.id,
        store_id: storeId,
        price: parseFloat(editForm.price),
        quantity: parseFloat(editForm.quantity),
        unit: editForm.unit,
        recorded_by: userId,
        on_sale: editForm.onSale,
      }

      if (editForm.packageSize && editForm.packageUnit) {
        priceData.package_size = parseFloat(editForm.packageSize)
        priceData.package_unit = editForm.packageUnit
      }

      if (editForm.priceHistoryId) {
        // Update existing price record
        await supabase
          .from('price_history')
          .update(priceData)
          .eq('id', editForm.priceHistoryId)
      } else {
        // Create new price record
        await supabase.from('price_history').insert(priceData)
      }
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">📦 Inventory</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">All items across your storage</p>
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={() => setShowScanner(true)}
                disabled={!hasShelves || lookingUpBarcode}
              >
                {lookingUpBarcode ? 'Looking up...' : '📷 Scan'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Scan barcode to add item</TooltipContent>
          </Tooltip>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button
                    className="bg-amber-500 hover:bg-amber-600"
                    disabled={!hasShelves}
                  >
                    + Add Item
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Add new item to inventory</TooltipContent>
            </Tooltip>
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
                  {/* Show nutrition info if scanned from barcode */}
                  {scannedNutrition && scannedNutrition.calories != null && (
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-sm font-medium text-green-800 mb-2">Nutrition Info (per 100g)</p>
                      <div className="grid grid-cols-3 gap-2 text-xs text-green-700">
                        <div>Calories: {scannedNutrition.calories}</div>
                        <div>Protein: {scannedNutrition.protein_g ?? '-'}g</div>
                        <div>Carbs: {scannedNutrition.carbs_g ?? '-'}g</div>
                        <div>Fat: {scannedNutrition.fat_g ?? '-'}g</div>
                        <div>Sugar: {scannedNutrition.sugar_g ?? '-'}g</div>
                        <div>Fiber: {scannedNutrition.fiber_g ?? '-'}g</div>
                      </div>
                      {scannedNutrition.nutriscore && (
                        <div className="mt-2">
                          <Badge className="bg-green-600">Nutri-Score: {scannedNutrition.nutriscore}</Badge>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Manual nutrition input (when not from barcode) */}
                  {!scannedNutrition && (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-gray-500 p-0 h-auto"
                        onClick={() => setShowNutritionFields(!showNutritionFields)}
                      >
                        {showNutritionFields ? '− Hide' : '+ Add'} Nutrition Info (optional)
                      </Button>
                      {showNutritionFields && (
                        <div className="p-3 bg-gray-50 rounded-lg border space-y-3">
                          <p className="text-xs text-gray-500">Per 100g serving</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label htmlFor="calories" className="text-xs">Calories</Label>
                              <Input
                                id="calories"
                                type="number"
                                min="0"
                                placeholder="0"
                                value={manualNutrition.calories}
                                onChange={(e) => setManualNutrition({ ...manualNutrition, calories: e.target.value })}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="protein" className="text-xs">Protein (g)</Label>
                              <Input
                                id="protein"
                                type="number"
                                min="0"
                                step="0.1"
                                placeholder="0"
                                value={manualNutrition.protein_g}
                                onChange={(e) => setManualNutrition({ ...manualNutrition, protein_g: e.target.value })}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="carbs" className="text-xs">Carbs (g)</Label>
                              <Input
                                id="carbs"
                                type="number"
                                min="0"
                                step="0.1"
                                placeholder="0"
                                value={manualNutrition.carbs_g}
                                onChange={(e) => setManualNutrition({ ...manualNutrition, carbs_g: e.target.value })}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="fat" className="text-xs">Fat (g)</Label>
                              <Input
                                id="fat"
                                type="number"
                                min="0"
                                step="0.1"
                                placeholder="0"
                                value={manualNutrition.fat_g}
                                onChange={(e) => setManualNutrition({ ...manualNutrition, fat_g: e.target.value })}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="sugar" className="text-xs">Sugar (g)</Label>
                              <Input
                                id="sugar"
                                type="number"
                                min="0"
                                step="0.1"
                                placeholder="0"
                                value={manualNutrition.sugar_g}
                                onChange={(e) => setManualNutrition({ ...manualNutrition, sugar_g: e.target.value })}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="fiber" className="text-xs">Fiber (g)</Label>
                              <Input
                                id="fiber"
                                type="number"
                                min="0"
                                step="0.1"
                                placeholder="0"
                                value={manualNutrition.fiber_g}
                                onChange={(e) => setManualNutrition({ ...manualNutrition, fiber_g: e.target.value })}
                                className="h-8"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="sodium" className="text-xs">Sodium (mg)</Label>
                            <Input
                              id="sodium"
                              type="number"
                              min="0"
                              placeholder="0"
                              value={manualNutrition.sodium_mg}
                              onChange={(e) => setManualNutrition({ ...manualNutrition, sodium_mg: e.target.value })}
                              className="h-8"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                {/* Package size for price/oz calculations */}
                {formData.price && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg border">
                    <Label className="text-sm text-gray-600 font-normal mb-2 block">
                      Package Size (for price per oz/unit)
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={formData.packageSize}
                          onChange={(e) => setFormData({ ...formData, packageSize: e.target.value })}
                          placeholder="e.g., 16"
                        />
                      </div>
                      <div className="space-y-1">
                        <Select
                          value={formData.packageUnit}
                          onValueChange={(value) => setFormData({ ...formData, packageUnit: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="oz">oz (weight)</SelectItem>
                            <SelectItem value="lb">lb</SelectItem>
                            <SelectItem value="g">grams</SelectItem>
                            <SelectItem value="kg">kg</SelectItem>
                            <SelectItem value="fl_oz">fl oz</SelectItem>
                            <SelectItem value="ml">ml</SelectItem>
                            <SelectItem value="L">liters</SelectItem>
                            <SelectItem value="gallon">gallon</SelectItem>
                            <SelectItem value="count">count</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      e.g., 16 oz bag = $0.31/oz for a $4.99 bag
                    </p>
                  </div>
                )}
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

      {/* Bulk Actions Bar */}
      {filteredInventory.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg max-w-4xl">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size === filteredInventory.length && filteredInventory.length > 0}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {selectedIds.size === 0
                ? 'Select all'
                : selectedIds.size === filteredInventory.length
                  ? 'Deselect all'
                  : `${selectedIds.size} selected`}
            </span>
          </label>
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteDialogOpen(true)}
            >
              Delete {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''}
            </Button>
          )}
        </div>
      )}

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
        <div className="space-y-2">
          {filteredInventory.map((inv) => {
            const isDepleted = inv.quantity === 0
            const isUpdating = updatingId === inv.id
            const hasPriority = inv.priority && inv.priority !== 'normal'

            return (
              <Card
                key={inv.id}
                className={`${isDepleted ? 'opacity-60 bg-gray-50 dark:bg-gray-800' : ''} ${
                  inv.priority === 'urgent' ? 'border-red-300 bg-red-50 dark:bg-red-900/30' :
                  inv.priority === 'use_soon' ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/30' : ''
                }`}
              >
                <CardContent className="p-3">
                  {/* Row 1: Checkbox, Icon, Name + Badges */}
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(inv.id)}
                      onChange={() => toggleItemSelection(inv.id)}
                      className="h-4 w-4 mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500 shrink-0"
                    />
                    <span className="text-lg shrink-0">{typeIcons[inv.shelves?.storage_units?.type || 'other']}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{inv.items?.name}</span>
                        {inv.items?.id && bestPrices[inv.items.id] && (
                          <Badge className="bg-green-600 text-xs">${bestPrices[inv.items.id].pricePerUnit.toFixed(2)}/{bestPrices[inv.items.id].displayUnit}</Badge>
                        )}
                        {inv.priority === 'urgent' && <Badge className="bg-red-500 text-xs">!</Badge>}
                        {inv.priority === 'use_soon' && <Badge className="bg-orange-500 text-xs">Soon</Badge>}
                        {getExpirationBadge(inv.expiration_date)}
                        {isDepleted && <Badge variant="secondary" className="text-xs">Empty</Badge>}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{inv.shelves?.storage_units?.name} → {inv.shelves?.name}</div>
                    </div>
                  </div>

                  {/* Row 2: Controls */}
                  <div className="flex items-center justify-end gap-1 mt-2 pl-7">
                    {!isDepleted && (
                      <button onClick={() => openPriorityDialog(inv)} className={`p-1 ${hasPriority ? 'text-orange-500' : 'text-gray-300'}`}>⚡</button>
                    )}
                    {isDepleted ? (
                      <Button size="sm" variant="outline" onClick={() => handleRestockItem(inv)} disabled={isUpdating} className="h-7 text-xs bg-green-50 text-green-700 border-green-200">Restock</Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleQuantityChange(inv, -1)} disabled={isUpdating} className="h-7 w-7 p-0">-</Button>
                        {editingQuantityId === inv.id ? (
                          <input
                            type="number"
                            min="0"
                            value={editingQuantityValue}
                            onChange={(e) => setEditingQuantityValue(e.target.value)}
                            onKeyDown={(e) => handleInlineQuantityKeyDown(e, inv)}
                            onBlur={() => handleInlineQuantityBlur(inv)}
                            autoFocus
                            className="w-12 h-7 text-center text-sm font-semibold border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <button
                            onClick={() => startInlineQuantityEdit(inv)}
                            className="w-8 text-center text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                            title="Click to edit quantity"
                          >
                            {inv.quantity}
                          </button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleQuantityChange(inv, 1)} disabled={isUpdating} className="h-7 w-7 p-0">+</Button>
                      </>
                    )}
                    <button onClick={() => openEditDialog(inv)} className="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs">Edit</button>
                    <button onClick={() => handleRemoveItem(inv)} className="px-1 py-1 text-red-400 hover:text-red-600 text-sm">✕</button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {deletingItem?.items?.name || 'this item'} from your inventory?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingItem(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedIds.size} Items</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} from your inventory?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkDeleteDialogOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={bulkDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkDeleting ? 'Removing...' : `Remove ${selectedIds.size} Items`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

            {/* Price Section */}
            <div className="border-t pt-4 mt-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Last Price Paid</p>
                {loadingPrice && <span className="text-xs text-gray-400">Loading...</span>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Store</Label>
                  {stores.length > 0 ? (
                    <Select
                      value={editForm.storeId || 'none'}
                      onValueChange={(value) => setEditForm({ ...editForm, storeId: value === 'none' ? '' : value, newStoreName: '' })}
                    >
                      <SelectTrigger className="h-9">
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
                      value={editForm.newStoreName}
                      onChange={(e) => setEditForm({ ...editForm, newStoreName: e.target.value })}
                      className="h-9"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Price ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    className="h-9"
                  />
                </div>
              </div>

              {stores.length > 0 && !editForm.storeId && (
                <Input
                  placeholder="Or enter new store name"
                  value={editForm.newStoreName}
                  onChange={(e) => setEditForm({ ...editForm, newStoreName: e.target.value, storeId: '' })}
                  className="mt-2 h-9"
                />
              )}

              {/* Package size for price per unit */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Package Size</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editForm.packageSize}
                    onChange={(e) => setEditForm({ ...editForm, packageSize: e.target.value })}
                    placeholder="e.g., 16"
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Size Unit</Label>
                  <Select
                    value={editForm.packageUnit}
                    onValueChange={(value) => setEditForm({ ...editForm, packageUnit: value })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oz">oz (weight)</SelectItem>
                      <SelectItem value="lb">lb</SelectItem>
                      <SelectItem value="g">grams</SelectItem>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="fl_oz">fl oz</SelectItem>
                      <SelectItem value="ml">ml</SelectItem>
                      <SelectItem value="L">liters</SelectItem>
                      <SelectItem value="gallon">gallon</SelectItem>
                      <SelectItem value="count">count</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* On sale checkbox */}
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.onSale}
                  onChange={(e) => setEditForm({ ...editForm, onSale: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">This was a sale price</span>
              </label>

              {editForm.price && editForm.packageSize && editForm.packageUnit && (
                <p className="text-xs text-green-600 mt-2">
                  = ${(parseFloat(editForm.price) / parseFloat(editForm.packageSize)).toFixed(2)}/{editForm.packageUnit}
                </p>
              )}
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
