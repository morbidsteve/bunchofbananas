import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StorageList } from '@/components/storage/storage-list'

export default async function StoragePage() {
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

  // Get storage units with shelf count
  const { data: storageUnits } = await supabase
    .from('storage_units')
    .select(`
      *,
      shelves (count)
    `)
    .eq('household_id', membership.household_id)
    .order('created_at', { ascending: false })

  return (
    <StorageList
      storageUnits={storageUnits || []}
      householdId={membership.household_id}
    />
  )
}
