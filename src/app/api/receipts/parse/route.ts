import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limit'
import { parseReceipt, detectStore } from '@/lib/receipt-parsing'
import { findBestMatch, type MatchCandidate } from '@/lib/fuzzy-match'
import type { ReceiptParseResponse, MatchResult } from '@/types/receipts'

const MAX_TEXT_LENGTH = 50000 // 50KB max text input

export async function POST(request: NextRequest) {
  // Rate limiting
  const clientIP = getClientIP(request.headers)
  const rateLimit = checkRateLimit(`receipt-parse:${clientIP}`, RATE_LIMITS.expensive)

  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)),
        },
      }
    )
  }

  // Require authentication
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { text, householdId } = body

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 })
  }

  if (!householdId || typeof householdId !== 'string') {
    return NextResponse.json({ error: 'No household ID provided' }, { status: 400 })
  }

  // Verify user has access to this household
  const { data: membership } = await supabase
    .from('household_members')
    .select('id')
    .eq('household_id', householdId)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Parse receipt text
  const sanitizedText = text.slice(0, MAX_TEXT_LENGTH)
  const { items: parsedItems, skippedLines } = parseReceipt(sanitizedText)

  // Fetch data for matching
  const [storesResult, shoppingListResult, itemsResult, inventoryResult] = await Promise.all([
    supabase
      .from('stores')
      .select('id, name, location')
      .eq('household_id', householdId),
    supabase
      .from('shopping_list')
      .select('id, item_id, custom_name, items(id, name, category)')
      .eq('household_id', householdId)
      .eq('is_checked', false),
    supabase
      .from('items')
      .select('id, name, category')
      .eq('household_id', householdId),
    supabase
      .from('inventory')
      .select('id, item_id, shelf_id, quantity, items(id, name, category)')
      .eq('quantity', 0), // Only depleted items for matching
  ])

  const stores = storesResult.data || []
  const shoppingList = shoppingListResult.data || []
  const items = itemsResult.data || []
  const depletedInventory = inventoryResult.data || []

  // Detect store
  const detectedStore = detectStore(sanitizedText, stores)

  // Build match candidates with priority
  const candidates: MatchCandidate[] = []

  // Priority 1: Shopping list items (unchecked)
  for (const slItem of shoppingList) {
    // items is returned as an object (many-to-one relationship) - cast through unknown for type safety
    const itemData = slItem.items as unknown as { id: string; name: string; category: string | null } | null
    const name = itemData?.name || slItem.custom_name
    if (name) {
      candidates.push({
        id: slItem.item_id || slItem.id,
        name,
        source: 'shopping_list',
        shoppingListId: slItem.id,
      })
    }
  }

  // Priority 2: Depleted inventory items (for restocking)
  for (const inv of depletedInventory) {
    // items is returned as an object (many-to-one relationship) - cast through unknown for type safety
    const itemData = inv.items as unknown as { id: string; name: string; category: string | null } | null
    if (itemData?.name) {
      // Skip if already in candidates from shopping list
      const alreadyExists = candidates.some(c => c.id === inv.item_id)
      if (!alreadyExists) {
        candidates.push({
          id: inv.item_id,
          name: itemData.name,
          source: 'inventory',
          inventoryId: inv.id,
          shelfId: inv.shelf_id,
        })
      }
    }
  }

  // Priority 3: All other items
  for (const item of items) {
    const alreadyExists = candidates.some(c => c.id === item.id)
    if (!alreadyExists) {
      candidates.push({
        id: item.id,
        name: item.name,
        source: 'items',
      })
    }
  }

  // Match each parsed item
  const matchedItems = parsedItems.map(item => {
    const bestMatch = findBestMatch(item.cleanedName, candidates)

    let match: MatchResult | undefined
    if (bestMatch) {
      match = {
        itemId: bestMatch.candidate.id,
        itemName: bestMatch.candidate.name,
        score: bestMatch.score,
        confidence: bestMatch.confidence,
        source: bestMatch.candidate.source,
        shoppingListId: bestMatch.candidate.shoppingListId,
        inventoryId: bestMatch.candidate.inventoryId,
        shelfId: bestMatch.candidate.shelfId,
      }
    }

    return {
      rawName: item.rawName,
      cleanedName: item.cleanedName,
      price: item.price,
      quantity: item.quantity,
      match,
    }
  })

  const response: ReceiptParseResponse = {
    success: true,
    store: detectedStore || undefined,
    items: matchedItems,
    skippedLines,
  }

  return NextResponse.json(response)
}
