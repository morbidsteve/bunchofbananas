import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ShoppingMode } from '@/components/shopping/shopping-mode'
import { calculateBestPrices } from '@/lib/price-utils'

export default async function ShoppingPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user's household
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/dashboard')

  // Get all inventory grouped by category (with shelf_id for receipt scanner)
  const { data: inventory } = await supabase
    .from('inventory')
    .select(`
      id,
      item_id,
      shelf_id,
      quantity,
      unit,
      expiration_date,
      items!inner (
        id,
        name,
        category,
        household_id,
        do_not_restock
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
    .eq('items.household_id', membership.household_id)
    .order('items(name)')

  // Get all items with their total inventory to find depleted ones
  const { data: items } = await supabase
    .from('items')
    .select(`
      id,
      name,
      category,
      do_not_restock,
      inventory (
        quantity
      )
    `)
    .eq('household_id', membership.household_id)
    .order('name')

  // Calculate depleted items (items with 0 total quantity across all locations)
  // Exclude items marked as do_not_restock
  const depletedItems = (items || []).filter(item => {
    if (item.do_not_restock) return false
    const totalQty = item.inventory?.reduce((sum: number, inv: { quantity: number }) => sum + inv.quantity, 0) || 0
    return item.inventory && item.inventory.length > 0 && totalQty === 0
  }).map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
  }))

  // Get shopping list items
  const { data: shoppingList } = await supabase
    .from('shopping_list')
    .select(`
      id,
      item_id,
      custom_name,
      quantity,
      unit,
      is_checked,
      notes,
      created_at,
      items (
        id,
        name,
        category
      )
    `)
    .eq('household_id', membership.household_id)
    .order('is_checked')
    .order('created_at', { ascending: false })

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

  // Get stores for receipt scanner
  const { data: stores } = await supabase
    .from('stores')
    .select('id, name, location')
    .eq('household_id', membership.household_id)
    .order('name')

  // Get storage units with shelves for receipt scanner
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
    .eq('household_id', membership.household_id)
    .order('name')

  // Get all items for receipt scanner matching
  const { data: allItems } = await supabase
    .from('items')
    .select('id, name, category')
    .eq('household_id', membership.household_id)
    .order('name')

  return (
    <ShoppingMode
      inventory={(inventory || []) as any}
      depletedItems={depletedItems}
      shoppingList={(shoppingList || []) as any}
      bestPrices={bestPrices}
      householdId={membership.household_id}
      userId={user.id}
      stores={(stores || []) as any}
      storageUnits={(storageUnits || []) as any}
      allItems={(allItems || []) as any}
    />
  )
}
