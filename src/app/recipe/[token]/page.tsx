import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function PublicRecipePage({ params }: PageProps) {
  const { token } = await params
  const supabase = await createClient()

  const { data: recipe, error } = await supabase
    .from('user_recipes')
    .select(
      `
      *,
      recipe_ingredients (*)
    `
    )
    .eq('share_token', token)
    .eq('is_public', true)
    .single()

  if (error || !recipe) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 max-w-4xl py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">🍌</span>
            <span className="font-bold text-gray-900">BunchOfBananas</span>
          </Link>
        </div>
      </header>

      {/* Recipe Content */}
      <main className="container mx-auto px-4 max-w-4xl py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{recipe.title}</CardTitle>
            {recipe.description && (
              <CardDescription className="text-base">
                {recipe.description}
              </CardDescription>
            )}
            <div className="flex items-center gap-2 flex-wrap pt-2">
              {recipe.category && (
                <Badge variant="secondary">{recipe.category}</Badge>
              )}
              {recipe.cuisine && <Badge variant="outline">{recipe.cuisine}</Badge>}
              {recipe.servings && (
                <Badge variant="outline">{recipe.servings} servings</Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Time info */}
            {(recipe.prep_time_minutes || recipe.cook_time_minutes) && (
              <div className="flex gap-4 text-sm text-gray-600">
                {recipe.prep_time_minutes && (
                  <span>Prep: {recipe.prep_time_minutes} min</span>
                )}
                {recipe.cook_time_minutes && (
                  <span>Cook: {recipe.cook_time_minutes} min</span>
                )}
                {recipe.prep_time_minutes && recipe.cook_time_minutes && (
                  <span className="font-medium">
                    Total: {recipe.prep_time_minutes + recipe.cook_time_minutes} min
                  </span>
                )}
              </div>
            )}

            {/* Ingredients */}
            <div>
              <h3 className="font-semibold text-lg mb-3">Ingredients</h3>
              <ul className="space-y-2">
                {recipe.recipe_ingredients
                  .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
                  .map((ing: {
                    id: string
                    quantity: string | null
                    unit: string | null
                    name: string
                    notes: string | null
                  }) => (
                    <li key={ing.id} className="flex items-start gap-2">
                      <span className="text-amber-500 mt-1">•</span>
                      <span>
                        {ing.quantity && `${ing.quantity} `}
                        {ing.unit && `${ing.unit} `}
                        <span className="font-medium">{ing.name}</span>
                        {ing.notes && (
                          <span className="text-gray-500"> ({ing.notes})</span>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>

            {/* Instructions */}
            <div>
              <h3 className="font-semibold text-lg mb-3">Instructions</h3>
              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-line text-gray-700">
                  {recipe.instructions}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-8">
          Shared from{' '}
          <Link href="/" className="text-amber-600 hover:underline">
            BunchOfBananas
          </Link>
        </p>
      </main>
    </div>
  )
}
