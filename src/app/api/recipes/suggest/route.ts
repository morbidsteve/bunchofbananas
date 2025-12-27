import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Recipe suggestion API using TheMealDB + user recipes
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
  image: string | null
  url: string | null
  youtubeUrl: string | null
  category: string
  area: string
  instructions: string
  ingredients: RecipeIngredient[]
  matchedCount: number
  totalIngredients: number
  matchPercentage: number
  isUserRecipe?: boolean
  shareToken?: string
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
    const { ingredients, householdId } = await request.json()

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json({ recipes: [] })
    }

    const recipes: Recipe[] = []
    const seenMealIds = new Set<string>()

    // Fetch user recipes if householdId is provided
    if (householdId) {
      try {
        const supabase = await createClient()
        const { data: userRecipes } = await supabase
          .from('user_recipes')
          .select(`
            *,
            recipe_ingredients (*)
          `)
          .eq('household_id', householdId)

        if (userRecipes) {
          for (const recipe of userRecipes) {
            const recipeIngredients: RecipeIngredient[] = (recipe.recipe_ingredients || []).map(
              (ing: { name: string; quantity: string | null; unit: string | null }) => ({
                name: ing.name,
                measure: ing.quantity ? `${ing.quantity} ${ing.unit || ''}`.trim() : '',
                inStock: hasIngredient(ing.name, ingredients),
              })
            )

            const matchedCount = recipeIngredients.filter(i => i.inStock).length
            const totalIngredients = recipeIngredients.length

            // Only include if at least one ingredient matches
            if (matchedCount > 0) {
              recipes.push({
                id: `user-${recipe.id}`,
                title: recipe.title,
                image: recipe.image_path || null,
                url: null,
                youtubeUrl: null,
                category: recipe.category || '',
                area: recipe.cuisine || '',
                instructions: recipe.instructions,
                ingredients: recipeIngredients,
                matchedCount,
                totalIngredients,
                matchPercentage: totalIngredients > 0 ? Math.round((matchedCount / totalIngredients) * 100) : 0,
                isUserRecipe: true,
                shareToken: recipe.share_token,
              })
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user recipes:', error)
        // Continue with TheMealDB even if user recipes fail
      }
    }

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
              isUserRecipe: false,
            })
          } catch {
            // Skip this meal if we can't get details
          }
        }
      } catch {
        // Skip this ingredient if fetch fails
      }

      // Stop if we have enough recipes
      if (recipes.length >= 15) break
    }

    // Sort recipes by match percentage (best matches first), user recipes first on tie
    recipes.sort((a, b) => {
      if (b.matchPercentage !== a.matchPercentage) {
        return b.matchPercentage - a.matchPercentage
      }
      // Prefer user recipes on tie
      return (b.isUserRecipe ? 1 : 0) - (a.isUserRecipe ? 1 : 0)
    })

    // Return top 10 recipes
    return NextResponse.json({
      recipes: recipes.slice(0, 10),
      searchedIngredients: ingredients,
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch recipes' },
      { status: 500 }
    )
  }
}
