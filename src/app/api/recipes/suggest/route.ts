import { NextRequest, NextResponse } from 'next/server'

// Recipe suggestion API using TheMealDB (free, no auth required)
// Falls back to curated suggestions based on ingredients

interface MealDBMeal {
  idMeal: string
  strMeal: string
  strMealThumb: string
  strSource: string
  strInstructions: string
}

export async function POST(request: NextRequest) {
  try {
    const { ingredients } = await request.json()

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json({ recipes: [] })
    }

    const recipes: { title: string; url: string; description: string }[] = []

    // Try to get recipes from TheMealDB (free API)
    // Search by main ingredient (first priority item or first item)
    const mainIngredient = ingredients[0]

    try {
      const response = await fetch(
        `https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(mainIngredient)}`
      )

      if (response.ok) {
        const data = await response.json()
        const meals: MealDBMeal[] = data.meals || []

        // Get details for up to 3 meals
        for (const meal of meals.slice(0, 3)) {
          try {
            const detailRes = await fetch(
              `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${meal.idMeal}`
            )
            if (detailRes.ok) {
              const detailData = await detailRes.json()
              const mealDetail = detailData.meals?.[0]
              if (mealDetail) {
                recipes.push({
                  title: mealDetail.strMeal,
                  url: mealDetail.strSource || `https://www.themealdb.com/meal/${meal.idMeal}`,
                  description: mealDetail.strInstructions?.substring(0, 150) + '...' || 'A delicious recipe',
                })
              }
            }
          } catch {
            // Skip this meal if we can't get details
          }
        }
      }
    } catch {
      // TheMealDB failed, use fallback
    }

    // If no recipes found, provide helpful suggestions
    if (recipes.length === 0) {
      const ingredientList = ingredients.slice(0, 3).join(', ')
      recipes.push(
        {
          title: `Recipes with ${ingredientList}`,
          url: `https://www.google.com/search?q=recipe+with+${encodeURIComponent(ingredients.join('+'))}`,
          description: `Search Google for recipes using your ingredients`,
        },
        {
          title: `AllRecipes - ${mainIngredient}`,
          url: `https://www.allrecipes.com/search?q=${encodeURIComponent(mainIngredient)}`,
          description: `Find recipes featuring ${mainIngredient} on AllRecipes`,
        },
        {
          title: `Tasty - ${mainIngredient} recipes`,
          url: `https://tasty.co/search?q=${encodeURIComponent(mainIngredient)}`,
          description: `Video recipes with ${mainIngredient} on Tasty`,
        }
      )
    }

    return NextResponse.json({ recipes })
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch recipes' },
      { status: 500 }
    )
  }
}
