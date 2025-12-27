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

// Normalize ingredient name for matching (remove adjectives, quantities, etc.)
function normalizeIngredient(name: string): string[] {
  const lower = name.toLowerCase()
  // Remove common adjectives and descriptors
  const cleaned = lower
    .replace(/\b(large|small|medium|fresh|dried|chopped|minced|diced|sliced|whole|ground|crushed|organic|raw|cooked|frozen|canned|ripe|unripe)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Split into individual words for partial matching
  const words = cleaned.split(' ').filter(w => w.length > 2)

  // Return both the cleaned name and individual significant words
  return [cleaned, ...words]
}

// Check if user has an ingredient (flexible matching)
function hasIngredient(recipeIngredient: string, userIngredients: string[]): boolean {
  const recipeTerms = normalizeIngredient(recipeIngredient)

  for (const userIng of userIngredients) {
    const userTerms = normalizeIngredient(userIng)

    // Check if any terms match
    for (const recipeTerm of recipeTerms) {
      for (const userTerm of userTerms) {
        // Exact match or one contains the other
        if (recipeTerm === userTerm ||
            recipeTerm.includes(userTerm) ||
            userTerm.includes(recipeTerm)) {
          return true
        }
      }
    }
  }

  return false
}

function extractIngredients(meal: MealDBMeal, userIngredients: string[]): RecipeIngredient[] {
  const ingredients: RecipeIngredient[] = []

  for (let i = 1; i <= 20; i++) {
    const ingredient = meal[`strIngredient${i}`]?.trim()
    const measure = meal[`strMeasure${i}`]?.trim()

    if (ingredient && ingredient !== '') {
      // Use flexible matching
      const inStock = hasIngredient(ingredient, userIngredients)
      ingredients.push({
        name: ingredient,
        measure: measure || '',
        inStock,
      })
    }
  }

  return ingredients
}

// Shuffle array using Fisher-Yates algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export async function POST(request: NextRequest) {
  try {
    const { ingredients } = await request.json()

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json({ recipes: [] })
    }

    const recipes: Recipe[] = []
    const seenMealIds = new Set<string>()

    // Shuffle ingredients to get different results each time
    const shuffledIngredients = shuffleArray(ingredients)
    const searchIngredients = shuffledIngredients.slice(0, 6)

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
