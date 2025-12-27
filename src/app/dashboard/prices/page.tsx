import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PriceTracker } from '@/components/prices/price-tracker'

export default async function PricesPage() {
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

  // Get all stores
  const { data: stores } = await supabase
    .from('stores')
    .select('*')
    .eq('household_id', householdId)
    .order('name')

  // Get all items for price recording
  const { data: items } = await supabase
    .from('items')
    .select('id, name, category, default_unit')
    .eq('household_id', householdId)
    .order('name')

  // Get recent price history with store and item info
  const { data: priceHistory } = await supabase
    .from('price_history')
    .select(`
      id,
      price,
      quantity,
      unit,
      on_sale,
      recorded_at,
      items!inner (
        id,
        name,
        category,
        household_id
      ),
      stores (
        id,
        name,
        location
      )
    `)
    .eq('items.household_id', householdId)
    .order('recorded_at', { ascending: false })
    .limit(100)

  return (
    <PriceTracker
      stores={stores || []}
      items={items || []}
      priceHistory={(priceHistory || []) as any}
      householdId={householdId}
      userId={user.id}
    />
  )
}
