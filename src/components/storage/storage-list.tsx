'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface StorageUnit {
  id: string
  name: string
  type: 'fridge' | 'freezer' | 'pantry' | 'cabinet' | 'other'
  location: string | null
  shelves: { count: number }[]
}

interface StorageListProps {
  storageUnits: StorageUnit[]
  householdId: string
}

const typeIcons: Record<string, string> = {
  fridge: '🧊',
  freezer: '❄️',
  pantry: '🗄️',
  cabinet: '🚪',
  other: '📦',
}

const typeLabels: Record<string, string> = {
  fridge: 'Refrigerator',
  freezer: 'Freezer',
  pantry: 'Pantry',
  cabinet: 'Cabinet',
  other: 'Other',
}

export function StorageList({ storageUnits, householdId }: StorageListProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    type: 'fridge' as const,
    location: '',
  })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()

    const { error } = await supabase
      .from('storage_units')
      .insert({
        household_id: householdId,
        name: formData.name,
        type: formData.type,
        location: formData.location || null,
      })

    if (!error) {
      setOpen(false)
      setFormData({ name: '', type: 'fridge', location: '' })
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Storage Units</h1>
          <p className="text-gray-600 mt-1">Manage your fridges, freezers, and pantries</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-amber-500 hover:bg-amber-600">
              + Add Storage
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Storage Unit</DialogTitle>
              <DialogDescription>
                Add a new fridge, freezer, pantry, or other storage location.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Kitchen Fridge"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value as typeof formData.type })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fridge">🧊 Refrigerator</SelectItem>
                    <SelectItem value="freezer">❄️ Freezer</SelectItem>
                    <SelectItem value="pantry">🗄️ Pantry</SelectItem>
                    <SelectItem value="cabinet">🚪 Cabinet</SelectItem>
                    <SelectItem value="other">📦 Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location (optional)</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Kitchen, Garage, etc."
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={loading}>
                  {loading ? 'Adding...' : 'Add Storage'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {storageUnits.length === 0 ? (
        <Card className="bg-gray-50">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="text-4xl mb-4">🗄️</div>
              <h3 className="text-lg font-semibold mb-2">No storage units yet</h3>
              <p className="text-gray-600 mb-4">
                Add your first fridge, freezer, or pantry to start organizing.
              </p>
              <Button
                onClick={() => setOpen(true)}
                className="bg-amber-500 hover:bg-amber-600"
              >
                Add Your First Storage Unit
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {storageUnits.map((unit) => (
            <Link key={unit.id} href={`/dashboard/storage/${unit.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="text-3xl">{typeIcons[unit.type]}</div>
                    <Badge variant="secondary">{typeLabels[unit.type]}</Badge>
                  </div>
                  <CardTitle className="mt-2">{unit.name}</CardTitle>
                  {unit.location && (
                    <CardDescription>{unit.location}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    {unit.shelves[0]?.count || 0} shelves
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
