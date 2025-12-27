import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ShoppingMode } from '@/components/shopping/shopping-mode'

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

  return <ShoppingMode inventory={(inventory || []) as any} depletedItems={depletedItems} />
}
