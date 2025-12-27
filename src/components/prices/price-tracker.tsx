'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import type { Store } from '@/types/database'

interface SimpleItem {
  id: string
  name: string
  category: string | null
  default_unit: string | null
}

interface PriceHistoryItem {
  id: string
  price: number
  quantity: number
  unit: string
  on_sale: boolean
  recorded_at: string
  items: {
    id: string
    name: string
    category: string | null
  } | null
  stores: {
    id: string
    name: string
    location: string | null
  } | null
}

interface PriceTrackerProps {
  stores: Store[]
  items: SimpleItem[]
  priceHistory: PriceHistoryItem[]
  householdId: string
  userId: string
}

export function PriceTracker({
  stores,
  items,
  priceHistory,
  householdId,
  userId,
}: PriceTrackerProps) {
  const router = useRouter()
  const [storeDialogOpen, setStoreDialogOpen] = useState(false)
  const [priceDialogOpen, setPriceDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const [storeForm, setStoreForm] = useState({ name: '', location: '' })
  const [priceForm, setPriceForm] = useState({
    itemId: '',
    storeId: '',
    price: '',
    quantity: '1',
    unit: 'count',
    onSale: false,
  })

  const filteredHistory = priceHistory.filter((ph) =>
    ph.items?.name.toLowerCase().includes(search.toLowerCase()) ||
    ph.stores?.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleAddStore(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.from('stores').insert({
      household_id: householdId,
      name: storeForm.name,
      location: storeForm.location || null,
    })

    if (!error) {
      setStoreDialogOpen(false)
      setStoreForm({ name: '', location: '' })
      router.refresh()
    }

    setLoading(false)
  }

  async function handleDeleteStore(storeId: string) {
    const supabase = createClient()
    await supabase.from('stores').delete().eq('id', storeId)
    router.refresh()
  }

  async function handleAddPrice(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.from('price_history').insert({
      item_id: priceForm.itemId,
      store_id: priceForm.storeId,
      price: parseFloat(priceForm.price),
      quantity: parseFloat(priceForm.quantity),
      unit: priceForm.unit,
      on_sale: priceForm.onSale,
      recorded_by: userId,
    })

    if (!error) {
      setPriceDialogOpen(false)
      setPriceForm({
        itemId: '',
        storeId: '',
        price: '',
        quantity: '1',
        unit: 'count',
        onSale: false,
      })
      router.refresh()
    }

    setLoading(false)
  }

  function formatPrice(price: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Group price history by item to show best prices
  const bestPrices = items.map((item) => {
    const itemPrices = priceHistory.filter((ph) => ph.items?.id === item.id)
    if (itemPrices.length === 0) return null

    // Calculate unit price for comparison
    const pricesWithUnit = itemPrices.map((ph) => ({
      ...ph,
      unitPrice: ph.price / ph.quantity,
    }))

    const lowest = pricesWithUnit.reduce((min, ph) =>
      ph.unitPrice < min.unitPrice ? ph : min
    )

    return {
      item,
      lowest,
      priceCount: itemPrices.length,
    }
  }).filter(Boolean)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Price Tracking</h1>
          <p className="text-gray-600 mt-1">Track and compare prices across stores</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={storeDialogOpen} onOpenChange={setStoreDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">+ Add Store</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Store</DialogTitle>
                <DialogDescription>Add a store to track prices at</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddStore} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="storeName">Store Name</Label>
                  <Input
                    id="storeName"
                    value={storeForm.name}
                    onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                    placeholder="Costco, Trader Joe's, etc."
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location (optional)</Label>
                  <Input
                    id="location"
                    value={storeForm.location}
                    onChange={(e) => setStoreForm({ ...storeForm, location: e.target.value })}
                    placeholder="123 Main St or Downtown"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setStoreDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={loading}>
                    {loading ? 'Adding...' : 'Add Store'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600" disabled={stores.length === 0 || items.length === 0}>
                + Record Price
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record Price</DialogTitle>
                <DialogDescription>Track a price you saw for an item</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddPrice} className="space-y-4">
                <div className="space-y-2">
                  <Label>Item</Label>
                  <Select
                    value={priceForm.itemId}
                    onValueChange={(value) => setPriceForm({ ...priceForm, itemId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} {item.category && `(${item.category})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Store</Label>
                  <Select
                    value={priceForm.storeId}
                    onValueChange={(value) => setPriceForm({ ...priceForm, storeId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select store" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.name} {store.location && `- ${store.location}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">Price ($)</Label>
                    <Input
                      id="price"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={priceForm.price}
                      onChange={(e) => setPriceForm({ ...priceForm, price: e.target.value })}
                      placeholder="4.99"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Qty</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={priceForm.quantity}
                      onChange={(e) => setPriceForm({ ...priceForm, quantity: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select
                      value={priceForm.unit}
                      onValueChange={(value) => setPriceForm({ ...priceForm, unit: value })}
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

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="onSale"
                    checked={priceForm.onSale}
                    onChange={(e) => setPriceForm({ ...priceForm, onSale: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="onSale" className="font-normal">This is a sale price</Label>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setPriceDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-600"
                    disabled={loading || !priceForm.itemId || !priceForm.storeId}
                  >
                    {loading ? 'Recording...' : 'Record Price'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">Price History</TabsTrigger>
          <TabsTrigger value="compare">Best Prices</TabsTrigger>
          <TabsTrigger value="stores">Stores ({stores.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4 mt-4">
          <Input
            placeholder="Search by item or store..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />

          {filteredHistory.length === 0 ? (
            <Card className="bg-gray-50">
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">💰</div>
                  <h3 className="text-lg font-semibold mb-2">
                    {search ? 'No matching prices' : 'No prices recorded yet'}
                  </h3>
                  <p className="text-gray-600">
                    {stores.length === 0
                      ? 'Add a store first, then start recording prices'
                      : items.length === 0
                        ? 'Add some items to inventory first'
                        : 'Record prices to track spending over time'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredHistory.map((ph) => (
                <Card key={ph.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-2xl">🏷️</div>
                        <div>
                          <div className="font-medium">{ph.items?.name}</div>
                          <div className="text-sm text-gray-500">
                            {ph.stores?.name} {ph.stores?.location && `• ${ph.stores.location}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold">{formatPrice(ph.price)}</span>
                          {ph.on_sale && <Badge variant="destructive">Sale</Badge>}
                        </div>
                        <div className="text-sm text-gray-500">
                          {ph.quantity} {ph.unit} • {formatDate(ph.recorded_at)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="compare" className="space-y-4 mt-4">
          {bestPrices.length === 0 ? (
            <Card className="bg-gray-50">
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">📊</div>
                  <h3 className="text-lg font-semibold mb-2">No price data yet</h3>
                  <p className="text-gray-600">Record prices to see comparisons</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {bestPrices.map((bp) => bp && (
                <Card key={bp.item.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-2xl">⭐</div>
                        <div>
                          <div className="font-medium">{bp.item.name}</div>
                          <div className="text-sm text-gray-500">
                            Best at {bp.lowest.stores?.name} • {bp.priceCount} price{bp.priceCount !== 1 ? 's' : ''} recorded
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-green-600">
                          {formatPrice(bp.lowest.unitPrice)}/{bp.lowest.unit}
                        </div>
                        <div className="text-sm text-gray-500">
                          {formatPrice(bp.lowest.price)} for {bp.lowest.quantity} {bp.lowest.unit}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="stores" className="space-y-4 mt-4">
          {stores.length === 0 ? (
            <Card className="bg-gray-50">
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">🏪</div>
                  <h3 className="text-lg font-semibold mb-2">No stores yet</h3>
                  <p className="text-gray-600">Add stores where you shop to track prices</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {stores.map((store) => (
                <Card key={store.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-2xl">🏪</div>
                        <div>
                          <div className="font-medium">{store.name}</div>
                          {store.location && (
                            <div className="text-sm text-gray-500">{store.location}</div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => handleDeleteStore(store.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
