// Price calculation utilities for normalizing and comparing prices

export interface PriceHistoryItem {
  id: string
  price: number
  quantity: number
  unit: string
  on_sale: boolean
  recorded_at: string
  package_size: number | null
  package_unit: string | null
  item_id: string
  store_id: string
  items?: {
    id: string
    name: string
  } | null
  stores?: {
    id: string
    name: string
    location: string | null
  } | null
}

export interface BestPrice {
  itemId: string
  pricePerUnit: number
  displayUnit: string
  storeName: string
  storeLocation: string | null
  originalPrice: number
  originalQuantity: number
  originalUnit: string
  packageSize: number | null
  packageUnit: string | null
  onSale: boolean
  recordedAt: string
}

// Unit conversion helper - converts to base unit for comparison
export function convertToBaseUnit(value: number, unit: string): { value: number; unit: string } {
  // Weight conversions (base: oz)
  if (unit === 'oz') return { value, unit: 'oz' }
  if (unit === 'lb') return { value: value * 16, unit: 'oz' }
  if (unit === 'g') return { value: value * 0.035274, unit: 'oz' }
  if (unit === 'kg') return { value: value * 35.274, unit: 'oz' }
  // Volume conversions (base: fl_oz)
  if (unit === 'fl_oz') return { value, unit: 'fl_oz' }
  if (unit === 'ml') return { value: value * 0.033814, unit: 'fl_oz' }
  if (unit === 'L' || unit === 'liter') return { value: value * 33.814, unit: 'fl_oz' }
  if (unit === 'gallon') return { value: value * 128, unit: 'fl_oz' }
  if (unit === 'quart') return { value: value * 32, unit: 'fl_oz' }
  if (unit === 'pint') return { value: value * 16, unit: 'fl_oz' }
  if (unit === 'cup') return { value: value * 8, unit: 'fl_oz' }
  // Count-based (no conversion)
  return { value, unit }
}

// Calculate normalized price per unit
export function calculatePricePerUnit(ph: PriceHistoryItem): { pricePerUnit: number; displayUnit: string } {
  // If package size is specified, use that for normalization
  if (ph.package_size && ph.package_unit) {
    const converted = convertToBaseUnit(ph.package_size, ph.package_unit)
    return {
      pricePerUnit: ph.price / converted.value,
      displayUnit: converted.unit,
    }
  }
  // Fallback to simple quantity calculation
  return {
    pricePerUnit: ph.price / ph.quantity,
    displayUnit: ph.unit,
  }
}

// Calculate best prices for each item from price history
export function calculateBestPrices(priceHistory: PriceHistoryItem[]): Map<string, BestPrice> {
  const bestPrices = new Map<string, BestPrice>()

  // Group by item_id
  const byItem = new Map<string, PriceHistoryItem[]>()
  for (const ph of priceHistory) {
    const itemId = ph.item_id
    if (!byItem.has(itemId)) {
      byItem.set(itemId, [])
    }
    byItem.get(itemId)!.push(ph)
  }

  // Find best price for each item
  for (const [itemId, prices] of byItem.entries()) {
    // Calculate unit price for each
    const pricesWithUnit = prices.map((ph) => {
      const { pricePerUnit, displayUnit } = calculatePricePerUnit(ph)
      return { ...ph, pricePerUnit, displayUnit }
    })

    // Find lowest price
    const lowest = pricesWithUnit.reduce((min, ph) =>
      ph.pricePerUnit < min.pricePerUnit ? ph : min
    )

    bestPrices.set(itemId, {
      itemId,
      pricePerUnit: lowest.pricePerUnit,
      displayUnit: lowest.displayUnit,
      storeName: lowest.stores?.name || 'Unknown',
      storeLocation: lowest.stores?.location || null,
      originalPrice: lowest.price,
      originalQuantity: lowest.quantity,
      originalUnit: lowest.unit,
      packageSize: lowest.package_size,
      packageUnit: lowest.package_unit,
      onSale: lowest.on_sale,
      recordedAt: lowest.recorded_at,
    })
  }

  return bestPrices
}

// Format price for display
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price)
}

// Format price per unit for display (e.g., "$0.25/oz")
export function formatPricePerUnit(pricePerUnit: number, unit: string): string {
  return `${formatPrice(pricePerUnit)}/${unit}`
}
