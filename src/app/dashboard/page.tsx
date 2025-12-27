import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateHouseholdForm } from '@/components/household/create-household-form'
import { DashboardOverview } from '@/components/dashboard/dashboard-overview'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user has a household
  const { data: membership } = await supabase
    .from('household_members')
    .select(`
      household_id,
      role,
      households (
        id,
        name
      )
    `)
    .eq('user_id', user.id)
    .single()

  // If no household, show create household form
  if (!membership) {
    return <CreateHouseholdForm userId={user.id} />
  }

  const householdId = membership.household_id

  // Get storage units count
  const { count: storageCount } = await supabase
    .from('storage_units')
    .select('*', { count: 'exact', head: true })
    .eq('household_id', householdId)

  // Get inventory items count
  const { count: inventoryCount } = await supabase
    .from('inventory')
    .select('*, items!inner(household_id)', { count: 'exact', head: true })
    .eq('items.household_id', householdId)

  // Get items expiring soon (within 7 days)
  const sevenDaysFromNow = new Date()
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

  const { data: expiringItems } = await supabase
    .from('inventory')
    .select(`
      id,
      quantity,
      unit,
      expiration_date,
      items (
        name,
        category
      ),
      shelves (
        name,
        storage_units (
          name
        )
      )
    `)
    .eq('items.household_id', householdId)
    .not('expiration_date', 'is', null)
    .lte('expiration_date', sevenDaysFromNow.toISOString().split('T')[0])
    .gte('expiration_date', new Date().toISOString().split('T')[0])
    .order('expiration_date', { ascending: true })
    .limit(5)

  // Get priority items (use_soon or urgent)
  const { data: priorityItems } = await supabase
    .from('inventory')
    .select(`
      id,
      quantity,
      unit,
      priority,
      condition_notes,
      items!inner (
        name,
        category,
        household_id
      ),
      shelves (
        name,
        storage_units (
          name
        )
      )
    `)
    .eq('items.household_id', householdId)
    .neq('priority', 'normal')
    .gt('quantity', 0)
    .order('priority', { ascending: false })
    .limit(10)

  // Get all inventory item names for recipe suggestions
  const { data: allInventory } = await supabase
    .from('inventory')
    .select(`
      id,
      quantity,
      items!inner (
        name,
        household_id
      )
    `)
    .eq('items.household_id', householdId)
    .gt('quantity', 0)

  const household = membership.households as unknown as { id: string; name: string }

  return (
    <DashboardOverview
      householdName={household.name}
      storageCount={storageCount || 0}
      inventoryCount={inventoryCount || 0}
      expiringItems={(expiringItems || []) as any}
      priorityItems={(priorityItems || []) as any}
      allInventoryItems={(allInventory || []).map(inv => (inv.items as any)?.name).filter(Boolean)}
    />
  )
}
