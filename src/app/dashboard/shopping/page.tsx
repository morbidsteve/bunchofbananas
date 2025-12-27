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

  return <ShoppingMode inventory={(inventory || []) as any} />
}
