import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { StorageDetail } from '@/components/storage/storage-detail'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function StorageDetailPage({ params }: PageProps) {
  const { id } = await params
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

  // Get storage unit with shelves and inventory count
  const { data: storageUnit } = await supabase
    .from('storage_units')
    .select(`
      *,
      shelves (
        id,
        name,
        position,
        inventory (
          id,
          quantity,
          unit,
          expiration_date,
          items (
            id,
            name,
            category
          )
        )
      )
    `)
    .eq('id', id)
    .eq('household_id', membership.household_id)
    .single()

  if (!storageUnit) notFound()

  // Get all items for the household (for add item dropdown)
  const { data: items } = await supabase
    .from('items')
    .select('id, name, category, default_unit')
    .eq('household_id', membership.household_id)
    .order('name')

  // Sort shelves by position
  const shelves = (storageUnit.shelves || []) as any[]
  const sortedShelves = shelves.sort((a: any, b: any) => a.position - b.position)

  return (
    <StorageDetail
      storageUnit={{ ...storageUnit, shelves: sortedShelves } as any}
      householdId={membership.household_id}
      userId={user.id}
      items={(items || []) as any}
    />
  )
}
