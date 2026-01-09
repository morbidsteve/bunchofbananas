'use client'

import { useState, useCallback, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ReceiptScanner } from './receipt-scanner'
import { ReceiptReview } from './receipt-review'
import { ReceiptConfirm } from './receipt-confirm'
import { celebrateSmall } from '@/lib/confetti'
import type {
  ReceiptWizardStep,
  ReceiptItem,
  DetectedStore,
  ReceiptParseResponse,
  ShoppingListItem,
  InventoryWithItem,
} from '@/types/receipts'

// Lazy load Tesseract for OCR
const loadTesseract = () => import('tesseract.js')

interface Store {
  id: string
  name: string
  location: string | null
}

interface Item {
  id: string
  name: string
  category: string | null
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

interface ReceiptWizardProps {
  householdId: string
  userId: string
  shoppingList: ShoppingListItem[]
  stores: Store[]
  items: Item[]
  inventory: InventoryWithItem[]
  storageUnits: StorageUnit[]
  onComplete: () => void
  onCancel: () => void
}

export function ReceiptWizard({
  householdId,
  userId,
  shoppingList,
  stores,
  items,
  inventory,
  storageUnits,
  onComplete,
  onCancel,
}: ReceiptWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<ReceiptWizardStep>('capture')
  const [imageData, setImageData] = useState<string | null>(null)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrText, setOcrText] = useState<string | null>(null)
  const [parsedItems, setParsedItems] = useState<ReceiptItem[]>([])
  const [detectedStore, setDetectedStore] = useState<DetectedStore | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [newStoreName, setNewStoreName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle image capture
  const handleCapture = useCallback(async (data: string) => {
    setImageData(data)
    setStep('processing')
    setOcrProgress(0)
    setError(null)

    try {
      // Load Tesseract and run OCR
      const Tesseract = (await loadTesseract()).default
      const result = await Tesseract.recognize(data, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100))
          }
        },
      })

      const text = result.data.text
      setOcrText(text)

      // Parse the receipt
      const response = await fetch('/api/receipts/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, householdId }),
      })

      if (!response.ok) {
        throw new Error('Failed to parse receipt')
      }

      const parseResult: ReceiptParseResponse = await response.json()

      if (!parseResult.success) {
        throw new Error(parseResult.error || 'Failed to parse receipt')
      }

      // Convert to ReceiptItem format with unique IDs
      const receiptItems: ReceiptItem[] = parseResult.items.map((item, index) => ({
        id: `receipt-item-${index}-${Date.now()}`,
        rawName: item.rawName,
        cleanedName: item.cleanedName,
        price: item.price,
        quantity: item.quantity,
        match: item.match || null,
        skip: false,
        isNewItem: false,
        shelfId: item.match?.shelfId,
      }))

      setParsedItems(receiptItems)
      setDetectedStore(parseResult.store || null)

      // Auto-select store if detected and matched
      if (parseResult.store?.matchedId) {
        setSelectedStoreId(parseResult.store.matchedId)
      }

      setStep('review')
    } catch (err) {
      console.error('OCR/parse error:', err)
      setError(err instanceof Error ? err.message : 'Failed to process receipt')
      setStep('capture')
    }
  }, [householdId])

  // Handle store selection
  const handleStoreChange = useCallback((storeId: string | null, storeName?: string) => {
    if (storeId) {
      setSelectedStoreId(storeId)
      setNewStoreName('')
    } else if (storeName !== undefined) {
      setSelectedStoreId(null)
      setNewStoreName(storeName)
    }
  }, [])

  // Handle items update from review
  const handleItemsChange = useCallback((newItems: ReceiptItem[]) => {
    setParsedItems(newItems)
  }, [])

  // Move to confirm step
  const handleReviewConfirm = useCallback(() => {
    setStep('confirm')
  }, [])

  // Execute the restock
  const handleFinalConfirm = useCallback(async () => {
    setLoading(true)
    setError(null)

    const supabase = createClient()

    try {
      // Get active items
      const activeItems = parsedItems.filter(item =>
        !item.skip &&
        (item.manualItemId || item.isNewItem || item.match) &&
        item.shelfId
      )

      if (activeItems.length === 0) {
        toast.error('No items to restock')
        setLoading(false)
        return
      }

      // Create new store if needed
      let storeId = selectedStoreId
      if (!storeId && newStoreName) {
        const { data: newStore, error: storeError } = await supabase
          .from('stores')
          .insert({
            household_id: householdId,
            name: newStoreName,
          })
          .select()
          .single()

        if (storeError) {
          throw new Error('Failed to create store')
        }
        storeId = newStore.id
      }

      if (!storeId) {
        throw new Error('No store selected')
      }

      // Process each item
      let successCount = 0
      for (const item of activeItems) {
        let itemId = item.manualItemId || item.match?.itemId

        // Create new item if needed
        if (item.isNewItem) {
          const { data: newItem, error: itemError } = await supabase
            .from('items')
            .insert({
              household_id: householdId,
              name: item.cleanedName,
              category: item.newItemCategory || null,
            })
            .select()
            .single()

          if (itemError) {
            console.error('Failed to create item:', item.cleanedName, itemError)
            continue
          }
          itemId = newItem.id
        }

        if (!itemId || !item.shelfId) {
          console.error('Missing item ID or shelf ID for:', item)
          continue
        }

        // Check if there's an existing inventory entry for this item at this shelf
        const { data: existingInventory } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq('item_id', itemId)
          .eq('shelf_id', item.shelfId)
          .single()

        if (existingInventory) {
          // Update existing inventory
          const newQuantity = existingInventory.quantity + item.quantity
          const { error: updateError } = await supabase
            .from('inventory')
            .update({ quantity: newQuantity })
            .eq('id', existingInventory.id)

          if (updateError) {
            console.error('Failed to update inventory:', updateError)
            continue
          }

          // Log the restock
          await supabase.from('inventory_log').insert({
            inventory_id: existingInventory.id,
            item_id: itemId,
            action: 'added',
            quantity_change: item.quantity,
            performed_by: userId,
            notes: `Restocked from receipt scan`,
          })
        } else {
          // Create new inventory entry
          const { data: newInventory, error: invError } = await supabase
            .from('inventory')
            .insert({
              item_id: itemId,
              shelf_id: item.shelfId,
              quantity: item.quantity,
              unit: 'count',
              added_by: userId,
            })
            .select()
            .single()

          if (invError) {
            console.error('Failed to create inventory:', invError)
            continue
          }

          // Log the addition
          await supabase.from('inventory_log').insert({
            inventory_id: newInventory.id,
            item_id: itemId,
            action: 'added',
            quantity_change: item.quantity,
            performed_by: userId,
            notes: 'Added from receipt scan',
          })
        }

        // Record price history
        await supabase.from('price_history').insert({
          item_id: itemId,
          store_id: storeId,
          price: item.price,
          quantity: item.quantity,
          unit: 'count',
          recorded_by: userId,
        })

        // Check off from shopping list if matched
        if (item.match?.shoppingListId) {
          await supabase
            .from('shopping_list')
            .update({ is_checked: true })
            .eq('id', item.match.shoppingListId)
        }

        successCount++
      }

      if (successCount > 0) {
        toast.success(`Restocked ${successCount} items!`)
        celebrateSmall()
        setStep('complete')
        router.refresh()
        setTimeout(() => {
          onComplete()
        }, 1500)
      } else {
        throw new Error('No items were restocked')
      }
    } catch (err) {
      console.error('Restock error:', err)
      setError(err instanceof Error ? err.message : 'Failed to restock items')
      toast.error('Failed to restock items')
    } finally {
      setLoading(false)
    }
  }, [parsedItems, selectedStoreId, newStoreName, householdId, userId, router, onComplete])

  // Get current store object
  const currentStore = selectedStoreId
    ? stores.find(s => s.id === selectedStoreId) || null
    : null

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      {/* Capture Step */}
      {step === 'capture' && (
        <ReceiptScanner onCapture={handleCapture} onCancel={onCancel} />
      )}

      {/* Processing Step */}
      {step === 'processing' && (
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="text-4xl animate-pulse">📄</div>
              <h3 className="text-lg font-semibold">Processing Receipt</h3>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${ocrProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600">
                {ocrProgress < 100 ? `Reading text... ${ocrProgress}%` : 'Parsing items...'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review Step */}
      {step === 'review' && (
        <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Review Items</h3>
                <Button variant="ghost" size="sm" onClick={onCancel}>
                  Cancel
                </Button>
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}
              <ReceiptReview
                items={parsedItems}
                detectedStore={detectedStore}
                stores={stores}
                allItems={items}
                inventory={inventory}
                storageUnits={storageUnits}
                onItemsChange={handleItemsChange}
                onStoreChange={handleStoreChange}
                selectedStoreId={selectedStoreId}
                newStoreName={newStoreName}
                onConfirm={handleReviewConfirm}
                onBack={() => setStep('capture')}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Step */}
      {step === 'confirm' && (
        <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Confirm Restock</h3>
                <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
                  Cancel
                </Button>
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}
              <ReceiptConfirm
                items={parsedItems}
                store={currentStore}
                newStoreName={newStoreName || null}
                storageUnits={storageUnits}
                onConfirm={handleFinalConfirm}
                onBack={() => setStep('review')}
                loading={loading}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Complete Step */}
      {step === 'complete' && (
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="text-6xl">✅</div>
              <h3 className="text-lg font-semibold text-green-700">Items Restocked!</h3>
              <p className="text-gray-600">
                Your inventory has been updated and prices recorded.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
