import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InventoryList } from '@/components/inventory/inventory-list'
import { calculateBestPrices } from '@/lib/price-utils'

export default async function InventoryPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user's household
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    redirect('/dashboard')
  }

  const householdId = membership.household_id

  // Get all inventory with related data
  const { data: inventory } = await supabase
    .from('inventory')
    .select(`
      id,
      quantity,
      unit,
      expiration_date,
      notes,
      priority,
      condition_notes,
      added_at,
      items!inner (
        id,
        name,
        category,
        household_id
      ),
      shelves (
        id,
        name,
        storage_units (
          id,
          name,
          type
        )
      )
    `)
    .eq('items.household_id', householdId)
    .order('added_at', { ascending: false })

  // Get all items for the add form
  const { data: items } = await supabase
    .from('items')
    .select('id, name, category, default_unit')
    .eq('household_id', householdId)
    .order('name')

  // Get all storage units with shelves for the add form
  const { data: storageUnits } = await supabase
    .from('storage_units')
    .select(`
      id,
      name,
      type,
      shelves (
        id,
        name,
        position
      )
    `)
    .eq('household_id', householdId)
    .order('name')

  // Get all stores for purchase location dropdown
  const { data: stores } = await supabase
    .from('stores')
    .select('id, name, location')
    .eq('household_id', householdId)
    .order('name')

  // Get price history for best price calculations
  const { data: priceHistory } = await supabase
    .from('price_history')
    .select(`
      id,
      price,
      quantity,
      unit,
      on_sale,
      recorded_at,
      package_size,
      package_unit,
      item_id,
      store_id,
      stores (
        id,
        name,
        location
      )
    `)
    .in('item_id', (items || []).map(i => i.id))
    .order('recorded_at', { ascending: false })

  // Calculate best prices map
  const bestPricesMap = calculateBestPrices((priceHistory || []) as any)
  const bestPrices = Object.fromEntries(bestPricesMap)

  return (
    <InventoryList
      inventory={(inventory || []) as any}
      items={(items || []) as any}
      storageUnits={(storageUnits || []) as any}
      stores={(stores || []) as any}
      householdId={householdId}
      userId={user.id}
      bestPrices={bestPrices}
    />
  )
}
