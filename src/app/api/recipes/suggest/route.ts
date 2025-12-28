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

// Words to remove when normalizing ingredients
const DESCRIPTORS = [
  'large', 'small', 'medium', 'big', 'tiny', 'thin', 'thick',
  'chopped', 'minced', 'diced', 'sliced', 'cubed', 'julienned', 'shredded',
  'grated', 'crushed', 'mashed', 'pureed', 'ground', 'whole', 'halved',
  'quartered', 'cut', 'torn', 'crumbled', 'flaked',
  'fresh', 'dried', 'frozen', 'canned', 'raw', 'cooked', 'roasted', 'grilled',
  'baked', 'fried', 'steamed', 'boiled', 'blanched', 'sauteed', 'braised',
  'pickled', 'marinated', 'smoked', 'cured',
  'organic', 'ripe', 'unripe', 'young', 'mature', 'aged',
  'red', 'green', 'yellow', 'orange', 'white', 'black', 'brown', 'purple',
  'golden', 'dark', 'light',
  'hot', 'cold', 'warm', 'chilled',
  'soft', 'hard', 'crispy', 'crunchy', 'tender', 'firm',
  'boneless', 'skinless', 'seedless', 'pitted', 'peeled', 'trimmed',
  'finely', 'roughly', 'coarsely', 'freshly', 'lightly',
]

// Ingredient synonyms - map variants to base ingredient
const SYNONYMS: Record<string, string> = {
  'peppers': 'pepper', 'bell pepper': 'pepper', 'bell peppers': 'pepper',
  'capsicum': 'pepper', 'sweet pepper': 'pepper', 'sweet peppers': 'pepper',
  'onions': 'onion', 'shallot': 'onion', 'shallots': 'onion',
  'scallion': 'onion', 'scallions': 'onion', 'green onion': 'onion',
  'tomatoes': 'tomato', 'cherry tomato': 'tomato', 'roma tomato': 'tomato',
  'potatoes': 'potato', 'spud': 'potato', 'spuds': 'potato',
  'carrots': 'carrot',
  'garlic clove': 'garlic', 'garlic cloves': 'garlic',
  'chicken breast': 'chicken', 'chicken thigh': 'chicken',
  'ground beef': 'beef', 'beef steak': 'beef', 'steak': 'beef',
  'mushrooms': 'mushroom', 'cremini': 'mushroom', 'portobello': 'mushroom',
  'eggs': 'egg', 'whole egg': 'egg',
  'lemons': 'lemon', 'lemon juice': 'lemon',
  'limes': 'lime', 'lime juice': 'lime',
  'cilantro': 'coriander', 'coriander leaves': 'coriander',
  'broth': 'stock', 'chicken stock': 'stock', 'beef stock': 'stock',
  'chicken broth': 'stock', 'vegetable stock': 'stock',
}

// Normalize ingredient name for matching
function normalizeIngredient(name: string): string[] {
  const lower = name.toLowerCase()
  // Remove quantities like "400g", "1 cup", "2 lbs", "1/2", "○400g", etc.
  const withoutQuantities = lower
    .replace(/^[○•·\-\s]*\d+[\d./]*\s*(g|kg|ml|l|oz|lb|lbs|cup|cups|tbsp|tsp|tablespoon|teaspoon|pound|pounds|ounce|ounces)?\s*/i, '')
    .replace(/\b\d+[\d./]*\s*(g|kg|ml|l|oz|lb|lbs|cup|cups|tbsp|tsp|tablespoon|teaspoon|pound|pounds|ounce|ounces)\b/gi, '')
  const descriptorPattern = new RegExp(`\\b(${DESCRIPTORS.join('|')})\\b`, 'g')
  const cleaned = withoutQuantities.replace(descriptorPattern, '').replace(/\s+/g, ' ').trim()

  const words = cleaned.split(' ').filter(w => w.length > 2)
  const baseIngredient = SYNONYMS[cleaned]
  const wordBases = words.map(w => SYNONYMS[w]).filter(Boolean) as string[]

  const results = [cleaned, ...words]
  if (baseIngredient) results.push(baseIngredient)
  results.push(...wordBases)

  return [...new Set(results)]
}

// Get core ingredient (main noun)
function getCoreIngredient(name: string): string {
  const lower = name.toLowerCase()
  // Remove quantities like "400g", "1 cup", "○400g", etc.
  const withoutQuantities = lower
    .replace(/^[○•·\-\s]*\d+[\d./]*\s*(g|kg|ml|l|oz|lb|lbs|cup|cups|tbsp|tsp|tablespoon|teaspoon|pound|pounds|ounce|ounces)?\s*/i, '')
    .replace(/\b\d+[\d./]*\s*(g|kg|ml|l|oz|lb|lbs|cup|cups|tbsp|tsp|tablespoon|teaspoon|pound|pounds|ounce|ounces)\b/gi, '')
  const descriptorPattern = new RegExp(`\\b(${DESCRIPTORS.join('|')})\\b`, 'g')
  const cleaned = withoutQuantities.replace(descriptorPattern, '').replace(/\s+/g, ' ').trim()
  const words = cleaned.split(' ')
  const lastWord = words[words.length - 1]
  return SYNONYMS[lastWord] || SYNONYMS[cleaned] || lastWord
}

// Levenshtein distance for fuzzy matching (handles typos)
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

// Check if two strings are similar (fuzzy match)
function isSimilar(a: string, b: string, threshold = 0.8): boolean {
  if (a === b) return true
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return true
  const distance = levenshteinDistance(a, b)
  const similarity = 1 - distance / maxLen
  return similarity >= threshold
}

// Check if user has an ingredient (flexible matching with fuzzy support)
function hasIngredient(recipeIngredient: string, userIngredients: string[]): boolean {
  const recipeTerms = normalizeIngredient(recipeIngredient)
  const recipeCore = getCoreIngredient(recipeIngredient)

  for (const userIng of userIngredients) {
    const userTerms = normalizeIngredient(userIng)
    const userCore = getCoreIngredient(userIng)

    // Check core ingredient match (with fuzzy matching for typos)
    if (recipeCore.length > 2 && userCore.length > 2) {
      if (recipeCore === userCore || isSimilar(recipeCore, userCore)) {
        return true
      }
    }

    // Check if any terms match
    for (const recipeTerm of recipeTerms) {
      for (const userTerm of userTerms) {
        // Exact match
        if (recipeTerm === userTerm) return true
        // Fuzzy match for longer terms
        if (recipeTerm.length >= 4 && userTerm.length >= 4) {
          if (isSimilar(recipeTerm, userTerm)) return true
          if (recipeTerm.includes(userTerm) || userTerm.includes(recipeTerm)) {
            return true
          }
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
