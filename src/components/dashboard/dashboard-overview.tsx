'use client'

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

interface DashboardOverviewProps {
  householdName: string
  storageCount: number
  inventoryCount: number
  expiringItems: ExpiringItem[]
}

export function DashboardOverview({
  householdName,
  storageCount,
  inventoryCount,
  expiringItems,
}: DashboardOverviewProps) {
  const today = new Date()

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
