'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface ExpiringItem {
  id: string
  quantity: number
  unit: string
  expiration_date: string
  items: {
    name: string
    category: string | null
  } | null
  shelves: {
    name: string
    storage_units: {
      name: string
    } | null
  } | null
}

interface PriorityItem {
  id: string
  quantity: number
  unit: string
  priority: 'use_soon' | 'urgent'
  condition_notes: string | null
  items: {
    name: string
    category: string | null
  } | null
  shelves: {
    name: string
    storage_units: {
      name: string
    } | null
  } | null
}

interface RecipeIngredient {
  name: string
  measure: string
  inStock: boolean
}

interface Recipe {
  id: string
  title: string
  image: string
  url: string
  youtubeUrl: string | null
  category: string
  area: string
  instructions: string
  ingredients: RecipeIngredient[]
  matchedCount: number
  totalIngredients: number
  matchPercentage: number
}

interface InventoryItemRef {
  id: string
  itemId: string
  name: string
}

interface DepletedItem {
  id: string
  quantity: number
  unit: string
  items: {
    id: string
    name: string
    category: string | null
  } | null
  shelves: {
    name: string
    storage_units: {
      name: string
    } | null
  } | null
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

interface Item {
  id: string
  name: string
  category: string | null
  default_unit: string | null
}

interface DashboardOverviewProps {
  householdName: string
  storageCount: number
  inventoryCount: number
  expiringItems: ExpiringItem[]
  priorityItems?: PriorityItem[]
  allInventoryItems?: InventoryItemRef[]
  depletedItems?: DepletedItem[]
  storageUnits?: StorageUnit[]
  items?: Item[]
  householdId?: string
  userId?: string
}

const typeIcons: Record<string, string> = {
  fridge: '🧊',
  freezer: '❄️',
  pantry: '🗄️',
  cabinet: '🚪',
  other: '📦',
}

export function DashboardOverview({
  householdName,
  storageCount,
  inventoryCount,
  expiringItems,
  priorityItems = [],
  allInventoryItems = [],
  depletedItems = [],
  storageUnits = [],
  items = [],
  householdId,
  userId,
}: DashboardOverviewProps) {
  const router = useRouter()
  const today = new Date()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loadingRecipes, setLoadingRecipes] = useState(false)
  const [recipeError, setRecipeError] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showItemSelector, setShowItemSelector] = useState(false)

  // Add Item dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [isNewItem, setIsNewItem] = useState(false)
  const [formData, setFormData] = useState({
    itemId: '',
    newItemName: '',
    newItemCategory: '',
    shelfId: '',
    quantity: '1',
    unit: 'count',
    expirationDate: '',
  })

  const hasShelves = storageUnits.some(u => u.shelves.length > 0)

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    if (!householdId || !userId) return

    setAddingItem(true)
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
        toast.error('Failed to create item')
        setAddingItem(false)
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
      const itemName = isNewItem ? formData.newItemName : items.find(i => i.id === itemId)?.name
      toast.success(`Added ${itemName} to inventory`)
      setAddDialogOpen(false)
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
    } else {
      toast.error('Failed to add item')
    }

    setAddingItem(false)
  }

  async function handleRestockItem(depleted: DepletedItem) {
    if (!depleted.items || !userId) return

    const supabase = createClient()
    const { error } = await supabase
      .from('inventory')
      .update({ quantity: 1 })
      .eq('id', depleted.id)

    if (error) {
      toast.error('Failed to restock item')
      return
    }

    // Log the restock
    await supabase.from('inventory_log').insert({
      inventory_id: depleted.id,
      item_id: depleted.items.id,
      action: 'added',
      quantity_change: 1,
      performed_by: userId,
      notes: 'Restocked from dashboard',
    })

    toast.success(`${depleted.items.name} restocked`)
    router.refresh()
  }

  function toggleItemSelection(itemId: string) {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId)
    } else {
      newSelected.add(itemId)
    }
    setSelectedItems(newSelected)
  }

  async function searchRecipes() {
    let ingredients: string[]

    // If user has selected specific items, use those
    if (selectedItems.size > 0) {
      ingredients = allInventoryItems
        .filter(item => selectedItems.has(item.id))
        .map(item => item.name)
    } else {
      // Otherwise, combine priority items with some regular items
      const priorityIngredients = priorityItems.map(p => p.items?.name).filter(Boolean) as string[]
      const otherIngredients = allInventoryItems
        .map(i => i.name)
        .filter(name => !priorityIngredients.includes(name))
        .slice(0, 5)
      ingredients = [...priorityIngredients, ...otherIngredients].slice(0, 10)
    }

    if (ingredients.length === 0) {
      setRecipeError('No items in inventory to search recipes for')
      return
    }

    setLoadingRecipes(true)
    setRecipeError('')

    try {
      const response = await fetch('/api/recipes/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients }),
      })

      if (!response.ok) throw new Error('Failed to fetch recipes')

      const data = await response.json()
      setRecipes(data.recipes || [])
    } catch {
      setRecipeError('Could not load recipe suggestions')
    } finally {
      setLoadingRecipes(false)
    }
  }

  function getDaysUntilExpiration(dateStr: string) {
    const expDate = new Date(dateStr)
    const diffTime = expDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  function getExpirationBadge(dateStr: string) {
    const days = getDaysUntilExpiration(dateStr)
    if (days <= 0) {
      return <Badge variant="destructive">Expired</Badge>
    } else if (days <= 2) {
      return <Badge variant="destructive">{days} day{days !== 1 ? 's' : ''}</Badge>
    } else {
      return <Badge variant="secondary">{days} days</Badge>
    }
  }

  function getMatchBadgeColor(percentage: number) {
    if (percentage >= 70) return 'bg-green-500'
    if (percentage >= 40) return 'bg-yellow-500'
    return 'bg-gray-400'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome to {householdName}</h1>
          <p className="text-gray-600 mt-1">Here&apos;s an overview of your home inventory</p>
        </div>
        {hasShelves && (
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600">
                + Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Item to Inventory</DialogTitle>
                <DialogDescription>
                  Quick add an item from the dashboard
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
                  <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-600"
                    disabled={addingItem || (!isNewItem && !formData.itemId) || !formData.shelfId}
                  >
                    {addingItem ? 'Adding...' : 'Add to Inventory'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-amber-600">{storageCount}</div>
            <p className="text-sm text-gray-600">Storage Units</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-amber-600">{inventoryCount}</div>
            <p className="text-sm text-gray-600">Items Tracked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-red-500">{expiringItems.length}</div>
            <p className="text-sm text-gray-600">Expiring Soon</p>
          </CardContent>
        </Card>
        <Card className={depletedItems.length > 0 ? 'border-amber-300 bg-amber-50' : ''}>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-amber-600">{depletedItems.length}</div>
            <p className="text-sm text-gray-600">Need to Restock</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>🗄️</span> Storage Units
            </CardTitle>
            <CardDescription>
              {storageCount === 0
                ? 'Add your first fridge, freezer, or pantry'
                : `You have ${storageCount} storage unit${storageCount !== 1 ? 's' : ''}`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/storage">
              <Button className="w-full bg-amber-500 hover:bg-amber-600">
                {storageCount === 0 ? 'Add Storage Unit' : 'Manage Storage'}
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>📦</span> Inventory
            </CardTitle>
            <CardDescription>
              {inventoryCount === 0
                ? 'Start adding items to your storage'
                : `Tracking ${inventoryCount} item${inventoryCount !== 1 ? 's' : ''}`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/inventory">
              <Button className="w-full" variant="outline">
                {inventoryCount === 0 ? 'Add First Item' : 'View Inventory'}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Depleted Items / Shopping List */}
      {depletedItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-amber-700">
                  <span>🛒</span> Need to Restock
                </CardTitle>
                <CardDescription>
                  Items that have run out - click to restock when you buy more
                </CardDescription>
              </div>
              <Link href="/dashboard/inventory">
                <Button variant="outline" size="sm">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {depletedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-100"
                >
                  <div>
                    <p className="font-medium">{item.items?.name}</p>
                    <p className="text-sm text-gray-500">
                      Was in {item.shelves?.storage_units?.name} - {item.shelves?.name}
                    </p>
                    {item.items?.category && (
                      <Badge variant="outline" className="mt-1 text-xs">
                        {item.items.category}
                      </Badge>
                    )}
                  </div>
                  <Button
                    onClick={() => handleRestockItem(item)}
                    className="bg-green-600 hover:bg-green-700"
                    size="sm"
                  >
                    Restock
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expiring Items */}
      {expiringItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <span>⚠️</span> Expiring Soon
            </CardTitle>
            <CardDescription>
              These items are expiring within the next 7 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {expiringItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{item.items?.name}</p>
                    <p className="text-sm text-gray-500">
                      {item.quantity} {item.unit} in {item.shelves?.storage_units?.name} - {item.shelves?.name}
                    </p>
                  </div>
                  {getExpirationBadge(item.expiration_date)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Use These Soon - Priority Items */}
      {priorityItems.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-orange-600">
                  <span>⚡</span> Use These Soon
                </CardTitle>
                <CardDescription>
                  Items marked for priority use - perfect for recipe planning
                </CardDescription>
              </div>
              <Button
                onClick={searchRecipes}
                disabled={loadingRecipes}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {loadingRecipes ? 'Finding...' : '🍳 Find Recipes'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {priorityItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    item.priority === 'urgent' ? 'bg-red-50' : 'bg-orange-50'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{item.items?.name}</p>
                      <Badge className={item.priority === 'urgent' ? 'bg-red-500' : 'bg-orange-500'}>
                        {item.priority === 'urgent' ? 'Urgent' : 'Use Soon'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500">
                      {item.quantity} {item.unit} in {item.shelves?.storage_units?.name} - {item.shelves?.name}
                    </p>
                    {item.condition_notes && (
                      <p className="text-sm text-orange-700 italic mt-1">{item.condition_notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Recipe Suggestions */}
            {recipeError && (
              <p className="text-red-500 text-sm mt-4">{recipeError}</p>
            )}
            {recipes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-orange-200">
                <h4 className="font-semibold text-gray-700 mb-3">🍽️ Recipe Ideas ({recipes.length} found)</h4>
                <div className="grid md:grid-cols-2 gap-3">
                  {recipes.map((recipe) => (
                    <div
                      key={recipe.id}
                      className="bg-white border border-orange-100 rounded-lg overflow-hidden hover:border-orange-300 transition-colors cursor-pointer"
                      onClick={() => setSelectedRecipe(recipe)}
                    >
                      <div className="flex">
                        {recipe.image && (
                          <div className="w-24 h-24 flex-shrink-0 relative">
                            <Image
                              src={recipe.image}
                              alt={recipe.title}
                              fill
                              className="object-cover"
                              sizes="96px"
                            />
                          </div>
                        )}
                        <div className="p-3 flex-1 min-w-0">
                          <p className="font-medium text-orange-700 truncate">{recipe.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={getMatchBadgeColor(recipe.matchPercentage)}>
                              {recipe.matchedCount}/{recipe.totalIngredients} ingredients
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {recipe.category} • {recipe.area}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recipe Finder for all inventory */}
      {allInventoryItems.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span>🍳</span> What Can I Make?
                </CardTitle>
                <CardDescription>
                  {selectedItems.size > 0
                    ? `Finding recipes with ${selectedItems.size} selected items`
                    : 'Get recipe ideas based on what you have in stock'
                  }
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowItemSelector(!showItemSelector)}
                  variant="outline"
                  size="sm"
                >
                  {showItemSelector ? 'Hide Selection' : 'Select Items'}
                  {selectedItems.size > 0 && ` (${selectedItems.size})`}
                </Button>
                <Button
                  onClick={searchRecipes}
                  disabled={loadingRecipes}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  {loadingRecipes ? 'Finding...' : 'Find Recipes'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Item Selector */}
            {showItemSelector && (
              <div className="border rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">Select ingredients to use:</p>
                  {selectedItems.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedItems(new Set())}
                      className="text-xs"
                    >
                      Clear all
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {allInventoryItems.map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                        selectedItems.has(item.id)
                          ? 'bg-amber-100 border-amber-400 text-amber-800'
                          : 'bg-white border-gray-200 hover:border-amber-300'
                      }`}
                    >
                      <Checkbox
                        checked={selectedItems.has(item.id)}
                        onCheckedChange={() => toggleItemSelection(item.id)}
                        className="hidden"
                      />
                      <span className="text-sm">{item.name}</span>
                      {selectedItems.has(item.id) && <span className="text-xs">✓</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Recipe Results */}
            {recipeError && (
              <p className="text-red-500 text-sm">{recipeError}</p>
            )}
            {recipes.length > 0 && (
              <div className="grid md:grid-cols-2 gap-3">
                {recipes.map((recipe) => (
                  <div
                    key={recipe.id}
                    className="bg-gray-50 border rounded-lg overflow-hidden hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => setSelectedRecipe(recipe)}
                  >
                    <div className="flex">
                      {recipe.image && (
                        <div className="w-24 h-24 flex-shrink-0 relative">
                          <Image
                            src={recipe.image}
                            alt={recipe.title}
                            fill
                            className="object-cover"
                            sizes="96px"
                          />
                        </div>
                      )}
                      <div className="p-3 flex-1 min-w-0">
                        <p className="font-medium truncate">{recipe.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={getMatchBadgeColor(recipe.matchPercentage)}>
                            {recipe.matchedCount}/{recipe.totalIngredients} ingredients
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {recipe.category} • {recipe.area}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recipe Detail Modal */}
      <Dialog open={!!selectedRecipe} onOpenChange={() => setSelectedRecipe(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedRecipe && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{selectedRecipe.title}</DialogTitle>
                <DialogDescription>
                  {selectedRecipe.category} • {selectedRecipe.area}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Image */}
                {selectedRecipe.image && (
                  <div className="relative w-full h-48 rounded-lg overflow-hidden">
                    <Image
                      src={selectedRecipe.image}
                      alt={selectedRecipe.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 600px"
                    />
                  </div>
                )}

                {/* Match info */}
                <div className="flex items-center gap-2">
                  <Badge className={getMatchBadgeColor(selectedRecipe.matchPercentage)}>
                    {selectedRecipe.matchPercentage}% match
                  </Badge>
                  <span className="text-sm text-gray-600">
                    You have {selectedRecipe.matchedCount} of {selectedRecipe.totalIngredients} ingredients
                  </span>
                </div>

                {/* Ingredients */}
                <div>
                  <h4 className="font-semibold mb-2">Ingredients</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedRecipe.ingredients.map((ing, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded text-sm ${
                          ing.inStock ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-600'
                        }`}
                      >
                        <span className="mr-1">{ing.inStock ? '✓' : '○'}</span>
                        {ing.measure} {ing.name}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Instructions */}
                <div>
                  <h4 className="font-semibold mb-2">Instructions</h4>
                  <div className="text-sm text-gray-700 whitespace-pre-line max-h-64 overflow-y-auto">
                    {selectedRecipe.instructions}
                  </div>
                </div>

                {/* Links */}
                <div className="flex gap-2 pt-2 border-t">
                  {selectedRecipe.url && (
                    <a
                      href={selectedRecipe.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1"
                    >
                      <Button variant="outline" className="w-full">
                        View Original Recipe
                      </Button>
                    </a>
                  )}
                  {selectedRecipe.youtubeUrl && (
                    <a
                      href={selectedRecipe.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1"
                    >
                      <Button variant="outline" className="w-full">
                        Watch Video
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Empty State */}
      {storageCount === 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="text-lg font-semibold mb-2">Get Started</h3>
              <p className="text-gray-600 mb-4">
                Add your first storage unit (fridge, freezer, or pantry) to start tracking your inventory.
              </p>
              <Link href="/dashboard/storage">
                <Button className="bg-amber-500 hover:bg-amber-600">
                  Add Your First Storage Unit
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
