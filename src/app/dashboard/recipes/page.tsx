import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RecipesManager } from '@/components/recipes/recipes-manager'

export default async function RecipesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/dashboard')

  // Get user recipes with ingredients
  const { data: recipes } = await supabase
    .from('user_recipes')
    .select(
      `
      *,
      recipe_ingredients (*)
    `
    )
    .eq('household_id', membership.household_id)
    .order('created_at', { ascending: false })

  // Get inventory for matching
  const { data: inventory } = await supabase
    .from('inventory')
    .select(
      `
      id,
      quantity,
      items!inner (
        id,
        name,
        household_id
      )
    `
    )
    .eq('items.household_id', membership.household_id)
    .gt('quantity', 0)

  const inventoryItems =
    (inventory
      ?.map((i) => (i.items as unknown as { name: string } | null)?.name)
      .filter(Boolean) as string[]) || []

  return (
    <RecipesManager
      recipes={(recipes || []) as any}
      inventoryItems={inventoryItems}
      householdId={membership.household_id}
      userId={user.id}
    />
  )
}
