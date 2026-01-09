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

  // Get all inventory grouped by category
  const { data: inventory } = await supabase
    .from('inventory')
    .select(`
      id,
      quantity,
      unit,
      expiration_date,
      items!inner (
        id,
        name,
        category,
        household_id
      ),
      shelves (
        name,
        storage_units (
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
      inventory (
        quantity
      )
    `)
    .eq('household_id', membership.household_id)
    .order('name')

  // Calculate depleted items (items with 0 total quantity across all locations)
  const depletedItems = (items || []).filter(item => {
    const totalQty = item.inventory?.reduce((sum: number, inv: { quantity: number }) => sum + inv.quantity, 0) || 0
    return item.inventory && item.inventory.length > 0 && totalQty === 0
  }).map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
  }))

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

  return <ShoppingMode inventory={(inventory || []) as any} depletedItems={depletedItems} bestPrices={bestPrices} />
}
