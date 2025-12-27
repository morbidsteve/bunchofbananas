import { NextRequest, NextResponse } from 'next/server'

// Recipe suggestion API using TheMealDB (free, no auth required)
// Returns multiple recipes with full details and ingredient matching

interface MealDBMeal {
  idMeal: string
  strMeal: string
  strMealThumb: string
  strSource: string
  strInstructions: string
  strCategory: string
  strArea: string
  strYoutube: string
  [key: string]: string | undefined
}

interface RecipeIngredient {
  name: string
  measure: string
  inStock: boolean
}

interface Recipe {
  id: string
  title: string
  image: string
  url: string
  youtubeUrl: string | null
  category: string
  area: string
  instructions: string
  ingredients: RecipeIngredient[]
  matchedCount: number
  totalIngredients: number
  matchPercentage: number
}

function extractIngredients(meal: MealDBMeal, userIngredients: string[]): RecipeIngredient[] {
  const ingredients: RecipeIngredient[] = []
  const userIngredientsLower = userIngredients.map(i => i.toLowerCase())

  for (let i = 1; i <= 20; i++) {
    const ingredient = meal[`strIngredient${i}`]?.trim()
    const measure = meal[`strMeasure${i}`]?.trim()

    if (ingredient && ingredient !== '') {
      const ingredientLower = ingredient.toLowerCase()
      // Check if user has this ingredient (partial match)
      const inStock = userIngredientsLower.some(
        ui => ingredientLower.includes(ui) || ui.includes(ingredientLower)
      )
      ingredients.push({
        name: ingredient,
        measure: measure || '',
        inStock,
      })
    }
  }

  return ingredients
}

export async function POST(request: NextRequest) {
  try {
    const { ingredients } = await request.json()

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json({ recipes: [] })
    }

    const recipes: Recipe[] = []
    const seenMealIds = new Set<string>()

    // Search for recipes using multiple ingredients to get variety
    const searchIngredients = ingredients.slice(0, 5)

    for (const ingredient of searchIngredients) {
      try {
        const response = await fetch(
          `https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(ingredient)}`
        )

        if (!response.ok) continue

        const data = await response.json()
        const meals: MealDBMeal[] = data.meals || []

        // Get details for meals we haven't seen yet
        for (const meal of meals.slice(0, 4)) {
          if (seenMealIds.has(meal.idMeal)) continue
          seenMealIds.add(meal.idMeal)

          try {
            const detailRes = await fetch(
              `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${meal.idMeal}`
            )
            if (!detailRes.ok) continue

            const detailData = await detailRes.json()
            const mealDetail: MealDBMeal = detailData.meals?.[0]
            if (!mealDetail) continue

            const recipeIngredients = extractIngredients(mealDetail, ingredients)
            const matchedCount = recipeIngredients.filter(i => i.inStock).length
            const totalIngredients = recipeIngredients.length

            recipes.push({
              id: mealDetail.idMeal,
              title: mealDetail.strMeal,
              image: mealDetail.strMealThumb,
              url: mealDetail.strSource || `https://www.themealdb.com/meal/${meal.idMeal}`,
              youtubeUrl: mealDetail.strYoutube || null,
              category: mealDetail.strCategory || '',
              area: mealDetail.strArea || '',
              instructions: mealDetail.strInstructions || '',
              ingredients: recipeIngredients,
              matchedCount,
              totalIngredients,
              matchPercentage: totalIngredients > 0 ? Math.round((matchedCount / totalIngredients) * 100) : 0,
            })
          } catch {
            // Skip this meal if we can't get details
          }
        }
      } catch {
        // Skip this ingredient if fetch fails
      }

      // Stop if we have enough recipes
      if (recipes.length >= 10) break
    }

    // Sort recipes by match percentage (best matches first)
    recipes.sort((a, b) => b.matchPercentage - a.matchPercentage)

    // Return top 8 recipes
    return NextResponse.json({
      recipes: recipes.slice(0, 8),
      searchedIngredients: ingredients,
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch recipes' },
      { status: 500 }
    )
  }
}
