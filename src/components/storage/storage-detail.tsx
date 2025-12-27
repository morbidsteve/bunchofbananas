'use client'

import { useState } from 'react'
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
}

const typeIcons: Record<string, string> = {
  fridge: '🧊',
  freezer: '❄️',
  pantry: '🗄️',
  cabinet: '🚪',
  other: '📦',
}

export function StorageDetail({ storageUnit, householdId }: StorageDetailProps) {
  const router = useRouter()
  const [shelfDialogOpen, setShelfDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [shelfName, setShelfName] = useState('')

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
        <div className="space-y-4">
          {storageUnit.shelves.map((shelf) => (
            <Card key={shelf.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{shelf.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {shelf.inventory.length} items
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          ⋮
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => handleDeleteShelf(shelf.id)}
                        >
                          Delete Shelf
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {shelf.inventory.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No items on this shelf</p>
                ) : (
                  <div className="space-y-2">
                    {shelf.inventory.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded"
                      >
                        <div>
                          <span className="font-medium">{inv.items?.name}</span>
                          <span className="text-gray-500 ml-2">
                            {inv.quantity} {inv.unit}
                          </span>
                        </div>
                        {inv.expiration_date && (
                          <Badge
                            variant={
                              new Date(inv.expiration_date) <= new Date()
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            Exp: {new Date(inv.expiration_date).toLocaleDateString()}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
