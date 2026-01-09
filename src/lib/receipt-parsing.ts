// Receipt text parsing utilities

import type { ParsedReceiptLine, ParsedReceiptItem, DetectedStore } from '@/types/receipts'
import { normalizeItemName } from './fuzzy-match'

// Patterns for lines to skip
const SKIP_PATTERNS = [
  /^(sub\s*total|subtotal)/i,
  /^(sales\s*tax|tax\s*\d|state\s*tax|local\s*tax)/i,
  /^(total|grand\s*total|balance\s*due)/i,
  /^(cash|credit|debit|visa|mastercard|amex|discover|change|tender|payment)/i,
  /^(thank\s*you|thanks\s*for|receipt|store\s*#|trans\s*#|transaction)/i,
  /^(register|cashier|terminal|ref\s*#)/i,
  /^(date|time|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /^(tel|phone|fax|www\.|http|email)/i,
  /^(member|savings|you\s*saved|discount|coupon)/i,
  /^(card\s*#|\*{4,})/i,
  /^(approved|authorization|auth\s*#)/i,
  /^\s*$/,
  /^[\-=_*]{3,}$/, // Separator lines
  /^#\d+\s*$/, // Item numbers only
]

// Price pattern - matches $X.XX, X.XX, or X.XX followed by optional tax indicator
const PRICE_PATTERN = /\$?\s*(\d+\.\d{2})(?:\s*[A-Z])?$/

// Quantity patterns
const QUANTITY_PATTERNS = [
  /^(\d+)\s*[@x]\s*/i,     // "2 @" or "2x" at start
  /^(\d+)\s+/,              // Number followed by space at start
  /(\d+)\s*[@x]\s*\$/i,     // "2 @ $" anywhere
]

// Weight/unit patterns that appear after item name
const WEIGHT_PATTERN = /(\d+\.?\d*)\s*(lb|oz|kg|g)\s*$/i

/**
 * Parse a single line from a receipt
 */
export function parseReceiptLine(line: string): ParsedReceiptLine {
  const trimmed = line.trim()

  // Check if this line should be skipped
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(trimmed)) {
      const lineType = determineSkipLineType(trimmed)
      return {
        rawText: trimmed,
        itemName: null,
        price: null,
        quantity: 1,
        lineType,
      }
    }
  }

  // Extract price
  const priceMatch = trimmed.match(PRICE_PATTERN)
  const price = priceMatch ? parseFloat(priceMatch[1]) : null

  // If no price found, it's probably not an item line
  if (price === null) {
    return {
      rawText: trimmed,
      itemName: trimmed,
      price: null,
      quantity: 1,
      lineType: 'unknown',
    }
  }

  // Extract quantity
  let quantity = 1
  let itemName = trimmed

  // Remove price from the end first
  if (priceMatch) {
    itemName = trimmed.slice(0, trimmed.lastIndexOf(priceMatch[0])).trim()
  }

  // Check for quantity patterns
  for (const pattern of QUANTITY_PATTERNS) {
    const qtyMatch = itemName.match(pattern)
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1])
      itemName = itemName.replace(pattern, '').trim()
      break
    }
  }

  // Remove weight info from the end if present
  const weightMatch = itemName.match(WEIGHT_PATTERN)
  if (weightMatch) {
    itemName = itemName.slice(0, itemName.lastIndexOf(weightMatch[0])).trim()
  }

  // Clean up item name
  itemName = cleanItemName(itemName)

  return {
    rawText: trimmed,
    itemName: itemName || null,
    price,
    quantity,
    lineType: 'item',
  }
}

/**
 * Determine the type of a skipped line
 */
function determineSkipLineType(line: string): ParsedReceiptLine['lineType'] {
  const lower = line.toLowerCase()
  if (lower.includes('subtotal') || lower.includes('sub total')) return 'subtotal'
  if (lower.includes('tax')) return 'tax'
  if (lower.includes('total') || lower.includes('balance')) return 'total'
  return 'header'
}

/**
 * Clean up an item name
 */
function cleanItemName(name: string): string {
  return name
    // Remove leading/trailing special characters
    .replace(/^[\s\-_*#]+|[\s\-_*#]+$/g, '')
    // Remove item codes (often start of line)
    .replace(/^\d{4,}\s+/, '')
    // Remove multiple spaces
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Parse entire receipt text into items
 */
export function parseReceipt(text: string): {
  items: ParsedReceiptItem[]
  skippedLines: Array<{ line: string; reason: string }>
} {
  const lines = text.split('\n').filter(l => l.trim())
  const items: ParsedReceiptItem[] = []
  const skippedLines: Array<{ line: string; reason: string }> = []

  for (const line of lines) {
    const parsed = parseReceiptLine(line)

    if (parsed.lineType === 'item' && parsed.itemName && parsed.price !== null) {
      // Skip items with suspiciously low or high prices
      if (parsed.price < 0.01 || parsed.price > 1000) {
        skippedLines.push({ line: parsed.rawText, reason: 'invalid_price' })
        continue
      }

      // Skip very short item names (likely parsing errors)
      if (parsed.itemName.length < 2) {
        skippedLines.push({ line: parsed.rawText, reason: 'name_too_short' })
        continue
      }

      items.push({
        rawName: parsed.rawText,
        cleanedName: normalizeItemName(parsed.itemName),
        price: parsed.price,
        quantity: parsed.quantity,
      })
    } else if (parsed.lineType !== 'item') {
      skippedLines.push({ line: parsed.rawText, reason: parsed.lineType })
    }
  }

  return { items, skippedLines }
}

// Common store name patterns and aliases
const STORE_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /walmart/i, name: 'Walmart' },
  { pattern: /target/i, name: 'Target' },
  { pattern: /costco/i, name: 'Costco' },
  { pattern: /sam'?s\s*club/i, name: "Sam's Club" },
  { pattern: /kroger/i, name: 'Kroger' },
  { pattern: /safeway/i, name: 'Safeway' },
  { pattern: /albertson/i, name: 'Albertsons' },
  { pattern: /publix/i, name: 'Publix' },
  { pattern: /aldi/i, name: 'Aldi' },
  { pattern: /lidl/i, name: 'Lidl' },
  { pattern: /trader\s*joe/i, name: "Trader Joe's" },
  { pattern: /whole\s*foods/i, name: 'Whole Foods' },
  { pattern: /sprouts/i, name: 'Sprouts' },
  { pattern: /h[\-\s]*e[\-\s]*b/i, name: 'HEB' },
  { pattern: /wegman/i, name: 'Wegmans' },
  { pattern: /harris\s*teeter/i, name: 'Harris Teeter' },
  { pattern: /food\s*lion/i, name: 'Food Lion' },
  { pattern: /giant/i, name: 'Giant' },
  { pattern: /stop\s*&?\s*shop/i, name: 'Stop & Shop' },
  { pattern: /meijer/i, name: 'Meijer' },
  { pattern: /winco/i, name: 'WinCo' },
  { pattern: /cvs/i, name: 'CVS' },
  { pattern: /walgreen/i, name: 'Walgreens' },
  { pattern: /rite\s*aid/i, name: 'Rite Aid' },
  { pattern: /dollar\s*(general|tree)/i, name: 'Dollar Store' },
  { pattern: /piggly\s*wiggly/i, name: 'Piggly Wiggly' },
  { pattern: /food\s*city/i, name: 'Food City' },
  { pattern: /jewel[\-\s]*osco/i, name: 'Jewel-Osco' },
  { pattern: /fresh\s*market/i, name: 'Fresh Market' },
  { pattern: /save[\-\s]*a[\-\s]*lot/i, name: 'Save-A-Lot' },
]

interface Store {
  id: string
  name: string
  location?: string | null
}

/**
 * Detect store from receipt text
 */
export function detectStore(
  text: string,
  knownStores: Store[]
): DetectedStore | null {
  // Check first 15 lines (header area)
  const headerLines = text.split('\n').slice(0, 15).join(' ').toLowerCase()

  // First, check against user's known stores
  for (const store of knownStores) {
    const storeName = store.name.toLowerCase()
    if (headerLines.includes(storeName)) {
      return {
        name: store.name,
        matchedId: store.id,
      }
    }
  }

  // Then try common store patterns
  for (const { pattern, name } of STORE_PATTERNS) {
    if (pattern.test(headerLines)) {
      // Check if this matches a known store
      const matchedStore = knownStores.find(
        s => s.name.toLowerCase() === name.toLowerCase()
      )
      return {
        name,
        matchedId: matchedStore?.id ?? null,
      }
    }
  }

  // Try to extract store name from "Welcome to X" pattern
  const welcomeMatch = text.match(/welcome\s+to\s+([^\n]+)/i)
  if (welcomeMatch) {
    const extractedName = welcomeMatch[1].trim()
    const matchedStore = knownStores.find(
      s => s.name.toLowerCase() === extractedName.toLowerCase()
    )
    return {
      name: extractedName,
      matchedId: matchedStore?.id ?? null,
    }
  }

  return null
}

/**
 * Estimate total from parsed items (for validation)
 */
export function calculateItemsTotal(items: ParsedReceiptItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}
