// Types for the receipt scanner feature

export interface ParsedReceiptLine {
  rawText: string
  itemName: string | null
  price: number | null
  quantity: number
  lineType: 'item' | 'header' | 'subtotal' | 'tax' | 'total' | 'unknown'
}

export interface ParsedReceiptItem {
  rawName: string
  cleanedName: string
  price: number
  quantity: number
}

export interface DetectedStore {
  name: string
  matchedId: string | null
}

export interface MatchResult {
  itemId: string
  itemName: string
  score: number
  confidence: 'high' | 'low'
  source: 'shopping_list' | 'inventory' | 'items'
  shoppingListId?: string
  inventoryId?: string
  shelfId?: string
}

export interface ReceiptItem {
  id: string // Temporary ID for UI tracking
  rawName: string
  cleanedName: string
  price: number
  quantity: number
  match: MatchResult | null
  manualItemId?: string // User-selected item
  manualItemName?: string
  skip: boolean
  isNewItem: boolean
  newItemCategory?: string
  shelfId?: string
}

export interface ConfirmedReceiptItem {
  itemId: string
  itemName: string
  price: number
  quantity: number
  shelfId: string
  storeId: string
  action: 'restock' | 'add_new' | 'skip'
  isNewItem: boolean
  newItemCategory?: string
  inventoryId?: string // For existing inventory items
}

export interface ReceiptParseRequest {
  text: string
  householdId: string
}

export interface ReceiptParseResponse {
  success: boolean
  store?: DetectedStore
  items: Array<{
    rawName: string
    cleanedName: string
    price: number
    quantity: number
    match?: MatchResult
  }>
  skippedLines?: Array<{
    line: string
    reason: string
  }>
  error?: string
}

// Shopping list item shape (from shopping-mode component)
export interface ShoppingListItem {
  id: string
  item_id: string | null
  custom_name: string | null
  quantity: number
  unit: string | null
  is_checked: boolean
  notes: string | null
  created_at: string
  items: {
    id: string
    name: string
    category: string | null
  } | null
}

// Inventory item with relations
export interface InventoryWithItem {
  id: string
  item_id: string
  shelf_id: string
  quantity: number
  unit: string
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

// Wizard step type
export type ReceiptWizardStep =
  | 'capture'
  | 'processing'
  | 'store'
  | 'review'
  | 'confirm'
  | 'complete'
