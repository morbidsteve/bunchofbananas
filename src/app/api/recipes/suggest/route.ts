import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limit'

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
  description: string
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
  source?: string
}

// Category-specific adjectives for more varied descriptions
const CATEGORY_DESCRIPTORS: Record<string, string[]> = {
  'Beef': ['hearty', 'savory', 'rich', 'satisfying'],
  'Chicken': ['tender', 'flavorful', 'succulent', 'classic'],
  'Dessert': ['sweet', 'indulgent', 'delightful', 'heavenly'],
  'Lamb': ['succulent', 'aromatic', 'traditional', 'rich'],
  'Miscellaneous': ['unique', 'creative', 'versatile', 'special'],
  'Pasta': ['comforting', 'Italian-inspired', 'hearty', 'satisfying'],
  'Pork': ['savory', 'tender', 'flavorful', 'hearty'],
  'Seafood': ['fresh', 'light', 'ocean-inspired', 'delicate'],
  'Side': ['complementary', 'simple', 'fresh', 'quick'],
  'Starter': ['appetizing', 'light', 'perfect', 'elegant'],
  'Vegan': ['plant-based', 'healthy', 'fresh', 'wholesome'],
  'Vegetarian': ['meatless', 'nutritious', 'garden-fresh', 'vibrant'],
  'Breakfast': ['morning', 'energizing', 'classic', 'satisfying'],
  'Goat': ['distinctive', 'tender', 'traditional', 'flavorful'],
}

// Area-specific cuisine descriptions
const AREA_DESCRIPTORS: Record<string, string> = {
  'American': 'classic American cuisine',
  'British': 'traditional British fare',
  'Canadian': 'hearty Canadian cooking',
  'Chinese': 'authentic Chinese flavors',
  'Croatian': 'Mediterranean-influenced Croatian cuisine',
  'Dutch': 'traditional Dutch cooking',
  'Egyptian': 'aromatic Egyptian cuisine',
  'Filipino': 'vibrant Filipino flavors',
  'French': 'refined French gastronomy',
  'Greek': 'fresh Mediterranean Greek cuisine',
  'Indian': 'aromatic Indian spices',
  'Irish': 'hearty Irish comfort food',
  'Italian': 'classic Italian cooking',
  'Jamaican': 'bold Jamaican flavors',
  'Japanese': 'delicate Japanese cuisine',
  'Kenyan': 'flavorful Kenyan cooking',
  'Malaysian': 'fusion Malaysian flavors',
  'Mexican': 'vibrant Mexican cuisine',
  'Moroccan': 'exotic Moroccan spices',
  'Polish': 'traditional Polish fare',
  'Portuguese': 'coastal Portuguese flavors',
  'Russian': 'hearty Russian cuisine',
  'Spanish': 'bold Spanish cooking',
  'Thai': 'aromatic Thai cuisine',
  'Tunisian': 'spiced Tunisian flavors',
  'Turkish': 'rich Turkish cuisine',
  'Vietnamese': 'fresh Vietnamese cooking',
}

// Generate a description from recipe details
function generateRecipeDescription(title: string, category: string, area: string, ingredientCount: number): string {
  // Get a random adjective for the category
  const adjectives = CATEGORY_DESCRIPTORS[category] || ['delicious', 'tasty', 'wonderful', 'flavorful']
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)]

  // Get the cuisine description
  const cuisineDesc = AREA_DESCRIPTORS[area] || (area ? `${area} cuisine` : '')

  // Build the description
  const parts: string[] = []

  if (cuisineDesc) {
    parts.push(`A ${adjective} ${category?.toLowerCase() || 'dish'} featuring ${cuisineDesc}`)
  } else {
    parts.push(`A ${adjective} ${category?.toLowerCase() || 'dish'}`)
  }

  if (ingredientCount > 0 && ingredientCount <= 5) {
    parts[0] += ', simple to prepare with just a few ingredients.'
  } else if (ingredientCount > 10) {
    parts[0] += `, crafted with ${ingredientCount} carefully selected ingredients.`
  } else if (ingredientCount > 0) {
    parts[0] += '.'
  } else {
    parts[0] += '.'
  }

  return parts.join(' ')
}

// TheMealDB category list for browsing
const MEAL_CATEGORIES = [
  'Beef', 'Chicken', 'Dessert', 'Lamb', 'Miscellaneous', 'Pasta', 'Pork',
  'Seafood', 'Side', 'Starter', 'Vegan', 'Vegetarian', 'Breakfast', 'Goat'
]

// TheMealDB area/cuisine list for variety
const MEAL_AREAS = [
  'American', 'British', 'Canadian', 'Chinese', 'Croatian', 'Dutch', 'Egyptian',
  'Filipino', 'French', 'Greek', 'Indian', 'Irish', 'Italian', 'Jamaican',
  'Japanese', 'Kenyan', 'Malaysian', 'Mexican', 'Moroccan', 'Polish',
  'Portuguese', 'Russian', 'Spanish', 'Thai', 'Tunisian', 'Turkish', 'Vietnamese'
]

// First letters for alphabetic browsing
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('')

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

// Common pantry staples assumed to always be available
const ALWAYS_AVAILABLE = new Set([
  'water', 'ice', 'tap water', 'cold water', 'hot water', 'warm water', 'boiling water',
  'salt', 'sea salt', 'table salt', 'kosher salt',
  'pepper', 'black pepper', 'ground pepper',
  'oil', 'cooking oil', 'vegetable oil', 'canola oil',
])

// Unit pattern with longer matches first to avoid partial matching
const UNIT_PATTERN = '(tablespoons?|teaspoons?|pounds?|ounces?|cups?|tbsp|tsp|lbs?|kg|ml|oz|g|l)'

// Normalize ingredient name for matching
function normalizeIngredient(name: string): string[] {
  const lower = name.toLowerCase()
  // Strip leading non-word chars (symbols), quantities, and units like "○400g " or "2 cups "
  // IMPORTANT: Only match units when preceded by digits to avoid stripping "g" from "garlic"
  const leadingPattern = new RegExp(`^[\\W]*\\d+[\\d./]*\\s*${UNIT_PATTERN}?\\s*`, 'gi')
  const inlinePattern = new RegExp(`\\b\\d+[\\d./]*\\s*${UNIT_PATTERN}?\\b`, 'gi')
  const withoutQuantities = lower
    .replace(leadingPattern, '')
    .replace(inlinePattern, '')
    .replace(/\s+/g, ' ')
    .trim()
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
  // Strip leading non-word chars (symbols), quantities, and units
  // IMPORTANT: Only match units when preceded by digits to avoid stripping "g" from "garlic"
  const leadingPattern = new RegExp(`^[\\W]*\\d+[\\d./]*\\s*${UNIT_PATTERN}?\\s*`, 'gi')
  const inlinePattern = new RegExp(`\\b\\d+[\\d./]*\\s*${UNIT_PATTERN}?\\b`, 'gi')
  const withoutQuantities = lower
    .replace(leadingPattern, '')
    .replace(inlinePattern, '')
    .replace(/\s+/g, ' ')
    .trim()
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

// Check if an ingredient is a common pantry staple (always available)
function isAlwaysAvailable(ingredient: string): boolean {
  const normalized = ingredient.toLowerCase().trim()
  // Check direct match
  if (ALWAYS_AVAILABLE.has(normalized)) return true
  // Check if any always-available item is contained in the ingredient
  for (const staple of ALWAYS_AVAILABLE) {
    if (normalized.includes(staple) || staple.includes(normalized)) {
      return true
    }
  }
  return false
}

// Check if user has an ingredient (flexible matching with fuzzy support)
function hasIngredient(recipeIngredient: string, userIngredients: string[]): boolean {
  // First check if it's a common staple that's always assumed available
  if (isAlwaysAvailable(recipeIngredient)) {
    return true
  }

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
        if (recipeTerm === userTerm) {
          return true
        }
        // Fuzzy match for longer terms
        if (recipeTerm.length >= 4 && userTerm.length >= 4) {
          if (isSimilar(recipeTerm, userTerm)) {
            return true
          }
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
    // Rate limiting
    const clientIP = getClientIP(request.headers)
    const rateLimit = checkRateLimit(`suggest:${clientIP}`, RATE_LIMITS.recipeSuggest)

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    const supabase = await createClient()

    // Check authentication - allow public access for TheMealDB recipes
    const { data: { user } } = await supabase.auth.getUser()

    const { ingredients, householdId, shareToken, page = 0, limit = 8 } = await request.json()

    // Validate input
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json({ recipes: [], hasMore: false })
    }

    // Limit ingredients to prevent abuse (max 200 ingredients)
    const validIngredients = ingredients.slice(0, 200).map(i => String(i).slice(0, 100))

    // For household access, verify either:
    // 1. User is authenticated and member of household
    // 2. Household is public (via share token)
    let canAccessHouseholdRecipes = false
    let verifiedHouseholdId: string | null = null

    if (householdId) {
      if (user) {
        // Authenticated user - check membership
        const { data: membership } = await supabase
          .from('household_members')
          .select('household_id')
          .eq('user_id', user.id)
          .eq('household_id', householdId)
          .single()

        if (membership) {
          canAccessHouseholdRecipes = true
          verifiedHouseholdId = householdId
        }
      }

      // Check if household is public (via share token or is_public flag)
      if (!canAccessHouseholdRecipes && shareToken) {
        const { data: publicHousehold } = await supabase
          .from('households')
          .select('id')
          .eq('share_token', shareToken)
          .eq('is_public', true)
          .single()

        if (publicHousehold && publicHousehold.id === householdId) {
          canAccessHouseholdRecipes = true
          verifiedHouseholdId = householdId
        }
      }
    }

    const recipes: Recipe[] = []
    const seenMealIds = new Set<string>()

    // Fetch user recipes if user has access to household
    if (canAccessHouseholdRecipes && verifiedHouseholdId) {
      try {
        const { data: userRecipes } = await supabase
          .from('user_recipes')
          .select(`
            *,
            recipe_ingredients (*)
          `)
          .eq('household_id', verifiedHouseholdId)

        if (userRecipes) {
          for (const recipe of userRecipes) {
            const recipeIngredients: RecipeIngredient[] = (recipe.recipe_ingredients || []).map(
              (ing: { name: string; quantity: string | null; unit: string | null }) => ({
                name: ing.name,
                measure: ing.quantity ? `${ing.quantity} ${ing.unit || ''}`.trim() : '',
                inStock: hasIngredient(ing.name, validIngredients),
              })
            )

            const matchedCount = recipeIngredients.filter(i => i.inStock).length
            const totalIngredients = recipeIngredients.length

            // Only include if at least one ingredient matches
            if (matchedCount > 0) {
              const category = recipe.category || ''
              const area = recipe.cuisine || ''

              recipes.push({
                id: `user-${recipe.id}`,
                title: recipe.title,
                description: recipe.description || generateRecipeDescription(recipe.title, category, area, totalIngredients),
                image: recipe.image_path || null,
                url: null,
                youtubeUrl: null,
                category,
                area,
                instructions: recipe.instructions,
                ingredients: recipeIngredients,
                matchedCount,
                totalIngredients,
                matchPercentage: totalIngredients > 0 ? Math.round((matchedCount / totalIngredients) * 100) : 0,
                isUserRecipe: true,
                shareToken: recipe.share_token,
                source: 'Your Recipes',
              })
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user recipes:', error)
        // Continue with TheMealDB even if user recipes fail
      }
    }

    // Helper to fetch and process a meal by ID
    async function processMeal(mealId: string): Promise<void> {
      if (seenMealIds.has(mealId)) return
      seenMealIds.add(mealId)

      try {
        const detailRes = await fetch(
          `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${mealId}`
        )
        if (!detailRes.ok) return

        const detailData = await detailRes.json()
        const mealDetail: MealDBMeal = detailData.meals?.[0]
        if (!mealDetail) return

        const recipeIngredients = extractIngredients(mealDetail, validIngredients)
        const matchedCount = recipeIngredients.filter(i => i.inStock).length
        const totalIngredients = recipeIngredients.length

        const category = mealDetail.strCategory || ''
        const area = mealDetail.strArea || ''

        recipes.push({
          id: mealDetail.idMeal,
          title: mealDetail.strMeal,
          description: generateRecipeDescription(mealDetail.strMeal, category, area, totalIngredients),
          image: mealDetail.strMealThumb,
          url: mealDetail.strSource || `https://www.themealdb.com/meal/${mealId}`,
          youtubeUrl: mealDetail.strYoutube || null,
          category,
          area,
          instructions: mealDetail.strInstructions || '',
          ingredients: recipeIngredients,
          matchedCount,
          totalIngredients,
          matchPercentage: totalIngredients > 0 ? Math.round((matchedCount / totalIngredients) * 100) : 0,
          isUserRecipe: false,
          source: 'TheMealDB',
        })
      } catch {
        // Skip this meal if we can't get details
      }
    }

    // Shuffle ingredients to get different results each time
    const shuffledIngredients = shuffleArray(validIngredients)
    const searchIngredients = shuffledIngredients.slice(0, 6)

    // Search by ingredients
    for (const ingredient of searchIngredients) {
      try {
        const response = await fetch(
          `https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(ingredient)}`
        )

        if (!response.ok) continue

        const data = await response.json()
        const meals: MealDBMeal[] = data.meals || []

        // Shuffle meals before selecting to get variety
        const shuffledMeals = shuffleArray(meals)

        // Get details for meals we haven't seen yet
        for (const meal of shuffledMeals.slice(0, 3)) {
          await processMeal(meal.idMeal)
        }
      } catch {
        // Skip this ingredient if fetch fails
      }

      // Stop if we have enough recipes (fetch more to support pagination)
      if (recipes.length >= 30) break
    }

    // Browse by random categories for more variety
    const shuffledCategories = shuffleArray(MEAL_CATEGORIES)
    const categoriesToBrowse = shuffledCategories.slice(0, 3)

    for (const category of categoriesToBrowse) {
      if (recipes.length >= 40) break
      try {
        const response = await fetch(
          `https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(category)}`
        )
        if (!response.ok) continue

        const data = await response.json()
        const meals: MealDBMeal[] = data.meals || []
        const shuffledMeals = shuffleArray(meals)

        // Get 2-3 meals from each category
        for (const meal of shuffledMeals.slice(0, 3)) {
          await processMeal(meal.idMeal)
        }
      } catch {
        // Skip if category fetch fails
      }
    }

    // Browse by random cuisines/areas for geographic diversity
    const shuffledAreas = shuffleArray(MEAL_AREAS)
    const areasToBrowse = shuffledAreas.slice(0, 3)

    for (const area of areasToBrowse) {
      if (recipes.length >= 50) break
      try {
        const response = await fetch(
          `https://www.themealdb.com/api/json/v1/1/filter.php?a=${encodeURIComponent(area)}`
        )
        if (!response.ok) continue

        const data = await response.json()
        const meals: MealDBMeal[] = data.meals || []
        const shuffledMeals = shuffleArray(meals)

        // Get 2-3 meals from each area
        for (const meal of shuffledMeals.slice(0, 3)) {
          await processMeal(meal.idMeal)
        }
      } catch {
        // Skip if area fetch fails
      }
    }

    // Browse by random first letters for alphabetic variety
    const shuffledLetters = shuffleArray(ALPHABET)
    const lettersToBrowse = shuffledLetters.slice(0, 2)

    for (const letter of lettersToBrowse) {
      if (recipes.length >= 60) break
      try {
        const response = await fetch(
          `https://www.themealdb.com/api/json/v1/1/search.php?f=${letter}`
        )
        if (!response.ok) continue

        const data = await response.json()
        const meals: MealDBMeal[] = data.meals || []
        const shuffledMeals = shuffleArray(meals)

        // Get 2-3 meals starting with each letter
        for (const meal of shuffledMeals.slice(0, 3)) {
          if (meal.idMeal) {
            await processMeal(meal.idMeal)
          }
        }
      } catch {
        // Skip if letter search fails
      }
    }

    // Add some random recipes for variety (especially good for discovering new meals)
    const randomCount = Math.max(0, 10 - Math.floor(recipes.length / 5))
    for (let i = 0; i < randomCount; i++) {
      try {
        const response = await fetch('https://www.themealdb.com/api/json/v1/1/random.php')
        if (!response.ok) continue

        const data = await response.json()
        const meal: MealDBMeal = data.meals?.[0]
        if (meal) {
          await processMeal(meal.idMeal)
        }
      } catch {
        // Skip if random fetch fails
      }
    }

    // Sort recipes by match percentage (best matches first), user recipes first on tie
    recipes.sort((a, b) => {
      if (b.matchPercentage !== a.matchPercentage) {
        return b.matchPercentage - a.matchPercentage
      }
      // Prefer user recipes on tie
      return (b.isUserRecipe ? 1 : 0) - (a.isUserRecipe ? 1 : 0)
    })

    // Paginate results
    const startIndex = page * limit
    const endIndex = startIndex + limit
    const paginatedRecipes = recipes.slice(startIndex, endIndex)
    const hasMore = endIndex < recipes.length

    return NextResponse.json({
      recipes: paginatedRecipes,
      searchedIngredients: validIngredients,
      hasMore,
      total: recipes.length,
    })
  } catch (error) {
    console.error('Recipe suggest API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch recipes', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
