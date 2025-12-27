import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ItemsManager } from '@/components/items/items-manager'

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

  // Get all items with their inventory entries
  const { data: items } = await supabase
    .from('items')
    .select(`
      id,
      name,
      category,
      default_unit,
      barcode,
      created_at,
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

  return (
    <ItemsManager
      items={(items || []) as any}
      storageUnits={(storageUnits || []) as any}
      householdId={householdId}
      userId={user.id}
    />
  )
}
