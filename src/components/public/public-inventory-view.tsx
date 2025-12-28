'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
  const [showDepleted, setShowDepleted] = useState(false)
  const [activeTab, setActiveTab] = useState('inventory')

  // Recipe state
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loadingRecipes, setLoadingRecipes] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [recipeError, setRecipeError] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)

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

  // Get all item names for recipe search
  const allItemNames = useMemo(() => {
    return inventory
      .filter((inv) => inv.quantity > 0 && inv.items?.name)
      .map((inv) => inv.items!.name)
  }, [inventory])

  // Get priority items
  const priorityItems = useMemo(() => {
    return inventory.filter(
      (inv) => inv.priority && inv.priority !== 'normal' && inv.quantity > 0
    )
  }, [inventory])

  // Get expiring items (within 7 days)
  const expiringItems = useMemo(() => {
    const now = Date.now()
    return inventory.filter((inv) => {
      if (!inv.expiration_date || inv.quantity <= 0) return false
      const diff = Math.ceil(
        (new Date(inv.expiration_date).getTime() - now) / (1000 * 60 * 60 * 24)
      )
      return diff <= 7 && diff >= 0
    })
  }, [inventory])

  // Get depleted items
  const depletedItems = useMemo(() => {
    return inventory.filter((inv) => inv.quantity === 0)
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

      // Quantity filter (show depleted or not)
      const matchesQuantity = showDepleted ? true : inv.quantity > 0

      return (
        matchesSearch &&
        matchesStorage &&
        matchesCategory &&
        matchesExpiring &&
        matchesPriority &&
        matchesQuantity
      )
    })
  }, [inventory, search, selectedStorage, selectedCategory, showExpiringOnly, showPriorityOnly, showDepleted])

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
  const totalItems = inventory.filter((i) => i.quantity > 0).length
  const expiringCount = expiringItems.length
  const priorityCount = priorityItems.length
  const depletedCount = depletedItems.length

  async function searchRecipes(page = 0, append = false) {
    if (allItemNames.length === 0) {
      setRecipeError('No items in inventory to search recipes for')
      return
    }

    if (append) {
      setLoadingMore(true)
    } else {
      setLoadingRecipes(true)
      setRecipes([])
    }
    setRecipeError('')

    try {
      // Send ALL ingredients for accurate matching - API handles optimization
      const priorityIngredients = priorityItems.map((p) => p.items?.name).filter(Boolean) as string[]
      const otherIngredients = allItemNames.filter((name) => !priorityIngredients.includes(name))
      const ingredients = [...priorityIngredients, ...otherIngredients]

      const response = await fetch('/api/recipes/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients, page, limit: 8 }),
      })

      if (!response.ok) throw new Error('Failed to fetch recipes')

      const data = await response.json()
      if (append) {
        setRecipes(prev => [...prev, ...(data.recipes || [])])
      } else {
        setRecipes(data.recipes || [])
      }
      setHasMore(data.hasMore || false)
      setCurrentPage(page)
    } catch {
      setRecipeError('Could not load recipe suggestions')
    } finally {
      setLoadingRecipes(false)
      setLoadingMore(false)
    }
  }

  async function loadMoreRecipes() {
    if (loadingMore || !hasMore) return
    await searchRecipes(currentPage + 1, true)
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

  function getMatchBadgeColor(percentage: number) {
    if (percentage >= 70) return 'bg-green-500'
    if (percentage >= 40) return 'bg-yellow-500'
    return 'bg-gray-400'
  }

  const hasFilters = search || selectedStorage || selectedCategory || showExpiringOnly || showPriorityOnly

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-amber-600">{totalItems}</div>
            <div className="text-sm text-gray-500">Items in Stock</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-amber-600">{storageUnits.length}</div>
            <div className="text-sm text-gray-500">Storage Units</div>
          </CardContent>
        </Card>
        <Card className={expiringCount > 0 ? 'border-red-200' : ''}>
          <CardContent className="pt-6">
            <div className={`text-3xl font-bold ${expiringCount > 0 ? 'text-red-500' : 'text-amber-600'}`}>
              {expiringCount}
            </div>
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

      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="inventory">📦 Inventory</TabsTrigger>
          <TabsTrigger value="recipes">🍳 Recipes</TabsTrigger>
          <TabsTrigger value="expiring">⚠️ Expiring</TabsTrigger>
          <TabsTrigger value="shopping">🛒 Shopping</TabsTrigger>
        </TabsList>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4 mt-4">
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
                  {categories.slice(0, 6).map((cat) => (
                    <Button
                      key={cat}
                      variant={selectedCategory === cat ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                    >
                      {cat}
                    </Button>
                  ))}
                  {categories.length > 6 && (
                    <span className="text-sm text-gray-500 self-center">+{categories.length - 6} more</span>
                  )}
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
              {depletedCount > 0 && (
                <Button
                  variant={showDepleted ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setShowDepleted(!showDepleted)}
                >
                  {showDepleted ? 'Hide' : 'Show'} Depleted ({depletedCount})
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
              Showing {filteredInventory.length} of {inventory.length} items
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
                            inv.quantity === 0
                              ? 'opacity-50 bg-gray-50 -mx-2 px-2 rounded'
                              : inv.priority === 'urgent'
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
                              {inv.quantity === 0 && (
                                <Badge variant="secondary">Depleted</Badge>
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
        </TabsContent>

        {/* Recipes Tab */}
        <TabsContent value="recipes" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <span>🍳</span> What Can I Make?
                  </CardTitle>
                  <CardDescription>
                    Find recipes based on {householdName}&apos;s inventory ({allItemNames.length} items available)
                  </CardDescription>
                </div>
                <Button
                  onClick={() => searchRecipes()}
                  disabled={loadingRecipes || allItemNames.length === 0}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  {loadingRecipes ? 'Finding...' : 'Find Recipes'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recipeError && (
                <p className="text-red-500 text-sm mb-4">{recipeError}</p>
              )}

              {recipes.length === 0 && !loadingRecipes && !recipeError && (
                <div className="text-center py-8 text-gray-500">
                  <p>Click &quot;Find Recipes&quot; to discover what you can make with available ingredients</p>
                </div>
              )}

              {recipes.length > 0 && (
                <>
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
                  {hasMore && (
                    <div className="flex justify-center mt-4">
                      <Button
                        onClick={loadMoreRecipes}
                        disabled={loadingMore}
                        variant="outline"
                        className="w-full max-w-xs"
                      >
                        {loadingMore ? 'Loading more...' : 'Load More Recipes'}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Priority Items for Recipes */}
          {priorityItems.length > 0 && (
            <Card className="border-orange-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-600">
                  <span>⚡</span> Use These First
                </CardTitle>
                <CardDescription>
                  Items marked as priority - recipes will prioritize these ingredients
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {priorityItems.map((item) => (
                    <Badge
                      key={item.id}
                      className={item.priority === 'urgent' ? 'bg-red-500' : 'bg-orange-500'}
                    >
                      {item.items?.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Expiring Tab */}
        <TabsContent value="expiring" className="space-y-4 mt-4">
          {expiringItems.length === 0 ? (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">✅</div>
                  <h3 className="text-lg font-semibold mb-2 text-green-800">All Good!</h3>
                  <p className="text-green-700">No items expiring in the next 7 days</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-red-200">
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
                  {expiringItems.map((item) => {
                    const days = Math.ceil(
                      (new Date(item.expiration_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    )
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          days <= 2 ? 'bg-red-50' : 'bg-orange-50'
                        }`}
                      >
                        <div>
                          <p className="font-medium">{item.items?.name}</p>
                          <p className="text-sm text-gray-500">
                            {item.quantity} {item.unit} in {item.shelves?.storage_units?.name} - {item.shelves?.name}
                          </p>
                        </div>
                        {getExpirationBadge(item.expiration_date)}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Priority Items */}
          {priorityItems.length > 0 && (
            <Card className="border-orange-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-600">
                  <span>⚡</span> Use These Soon
                </CardTitle>
                <CardDescription>
                  Items marked for priority use
                </CardDescription>
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
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Shopping Tab */}
        <TabsContent value="shopping" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>🛒</span> Shopping List
              </CardTitle>
              <CardDescription>
                Depleted items that need restocking
              </CardDescription>
            </CardHeader>
            <CardContent>
              {depletedItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-4">✅</div>
                  <p>No items need restocking - inventory is fully stocked!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {depletedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 border-2 border-gray-300 rounded"></div>
                        <div>
                          <p className="font-medium">{item.items?.name}</p>
                          <p className="text-sm text-gray-500">
                            Was in: {item.shelves?.storage_units?.name} - {item.shelves?.name}
                          </p>
                        </div>
                      </div>
                      {item.items?.category && (
                        <Badge variant="outline">{item.items.category}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Low Stock Warning */}
          {inventory.filter((i) => i.quantity === 1).length > 0 && (
            <Card className="border-yellow-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-700">
                  <span>⚠️</span> Running Low
                </CardTitle>
                <CardDescription>
                  Items with only 1 remaining
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {inventory
                    .filter((i) => i.quantity === 1)
                    .map((item) => (
                      <Badge key={item.id} variant="secondary">
                        {item.items?.name}
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

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
    </div>
  )
}
