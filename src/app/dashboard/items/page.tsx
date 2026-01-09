import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ItemsManager } from '@/components/items/items-manager'
import { calculateBestPrices } from '@/lib/price-utils'

export default async function ItemsPage() {
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

  // Get all items with their inventory entries and nutrition info
  const { data: items } = await supabase
    .from('items')
    .select(`
      id,
      name,
      category,
      default_unit,
      barcode,
      created_at,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      sugar_g,
      sodium_mg,
      nutriscore,
      do_not_restock,
      inventory (
        id,
        quantity,
        unit,
        expiration_date,
        shelves (
          id,
          name,
          storage_units (
            id,
            name,
            type
          )
        )
      )
    `)
    .eq('household_id', householdId)
    .order('name')

  // Get all storage units with shelves for the location picker
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
    <ItemsManager
      items={(items || []) as any}
      storageUnits={(storageUnits || []) as any}
      householdId={householdId}
      userId={user.id}
      bestPrices={bestPrices}
    />
  )
}
