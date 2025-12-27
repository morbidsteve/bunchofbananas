'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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

interface RecipeSuggestion {
  title: string
  url: string
  description: string
}

interface DashboardOverviewProps {
  householdName: string
  storageCount: number
  inventoryCount: number
  expiringItems: ExpiringItem[]
  priorityItems?: PriorityItem[]
  allInventoryItems?: string[]
}

export function DashboardOverview({
  householdName,
  storageCount,
  inventoryCount,
  expiringItems,
  priorityItems = [],
  allInventoryItems = [],
}: DashboardOverviewProps) {
  const today = new Date()
  const [recipes, setRecipes] = useState<RecipeSuggestion[]>([])
  const [loadingRecipes, setLoadingRecipes] = useState(false)
  const [recipeError, setRecipeError] = useState('')

  async function searchRecipes() {
    // Combine priority items with some regular items for recipe search
    const priorityIngredients = priorityItems.map(p => p.items?.name).filter(Boolean)
    const otherIngredients = allInventoryItems.filter(item => !priorityIngredients.includes(item)).slice(0, 5)
    const ingredients = [...priorityIngredients, ...otherIngredients].slice(0, 8)

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Welcome to {householdName}</h1>
        <p className="text-gray-600 mt-1">Here&apos;s an overview of your home inventory</p>
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
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl">🛒</div>
            <Link href="/dashboard/shopping">
              <Button variant="link" className="p-0 h-auto text-sm">
                Shopping Mode
              </Button>
            </Link>
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
                <h4 className="font-semibold text-gray-700 mb-3">🍽️ Recipe Ideas</h4>
                <div className="space-y-2">
                  {recipes.map((recipe, idx) => (
                    <a
                      key={idx}
                      href={recipe.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 bg-white border border-orange-100 rounded-lg hover:border-orange-300 transition-colors"
                    >
                      <p className="font-medium text-orange-700">{recipe.title}</p>
                      <p className="text-sm text-gray-600">{recipe.description}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recipe Finder for all inventory */}
      {priorityItems.length === 0 && allInventoryItems.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span>🍳</span> What Can I Make?
                </CardTitle>
                <CardDescription>
                  Get recipe ideas based on what you have in stock
                </CardDescription>
              </div>
              <Button
                onClick={searchRecipes}
                disabled={loadingRecipes}
                variant="outline"
              >
                {loadingRecipes ? 'Finding...' : 'Find Recipes'}
              </Button>
            </div>
          </CardHeader>
          {(recipes.length > 0 || recipeError) && (
            <CardContent>
              {recipeError && (
                <p className="text-red-500 text-sm">{recipeError}</p>
              )}
              {recipes.length > 0 && (
                <div className="space-y-2">
                  {recipes.map((recipe, idx) => (
                    <a
                      key={idx}
                      href={recipe.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <p className="font-medium">{recipe.title}</p>
                      <p className="text-sm text-gray-600">{recipe.description}</p>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

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
