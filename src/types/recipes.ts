import type { UserRecipe, RecipeIngredient } from './database'

// Extended recipe ingredient with inventory matching status
export interface RecipeIngredientWithMatch extends RecipeIngredient {
  inStock: boolean
}

// Recipe with ingredients included (from Supabase join)
export interface UserRecipeWithIngredients extends UserRecipe {
  recipe_ingredients: RecipeIngredient[]
}

// Recipe with computed match statistics
export interface UserRecipeWithMatch extends UserRecipeWithIngredients {
  matchedCount: number
  totalIngredients: number
  matchPercentage: number
  ingredientsWithMatch?: RecipeIngredientWithMatch[]
}

// Parsed recipe data from text/OCR import
export interface ParsedRecipeData {
  title: string
  description?: string
  instructions: string
  ingredients: ParsedIngredient[]
  category?: string
  cuisine?: string
  prepTime?: number
  cookTime?: number
  servings?: number
}

// Individual parsed ingredient before normalization
export interface ParsedIngredient {
  name: string
  quantity?: string
  unit?: string
  notes?: string
}

// Form data for creating/editing recipes
export interface RecipeFormData {
  title: string
  description: string
  instructions: string
  category: string
  cuisine: string
  prepTime: string
  cookTime: string
  servings: string
  ingredients: IngredientFormItem[]
  sourceType: 'manual' | 'text_import' | 'ocr_import' | 'url_import'
  sourceUrl: string
  originalText: string
}

// Single ingredient in the form
export interface IngredientFormItem {
  id: string // Temp ID for form management
  name: string
  quantity: string
  unit: string
  notes: string
}

// Common recipe categories
export const RECIPE_CATEGORIES = [
  'Appetizer',
  'Breakfast',
  'Dessert',
  'Dinner',
  'Lunch',
  'Main Course',
  'Salad',
  'Side Dish',
  'Snack',
  'Soup',
  'Other',
] as const

// Common cuisines
export const CUISINES = [
  'American',
  'Asian',
  'Chinese',
  'French',
  'Greek',
  'Indian',
  'Italian',
  'Japanese',
  'Korean',
  'Mediterranean',
  'Mexican',
  'Middle Eastern',
  'Thai',
  'Vietnamese',
  'Other',
] as const

// Words to remove when normalizing ingredients
const DESCRIPTORS = [
  'large', 'small', 'medium', 'big', 'tiny', 'thin', 'thick',
  'chopped', 'minced', 'diced', 'sliced', 'cubed', 'julienned', 'shredded',
  'grated', 'crushed', 'mashed', 'pureed', 'ground', 'whole', 'halved',
  'quartered', 'cut', 'torn', 'crumbled', 'flaked',
  'fresh', 'dried', 'frozen', 'canned', 'raw', 'cooked', 'roasted', 'grilled',
  'baked', 'fried', 'steamed', 'boiled', 'blanched', 'sauteed', 'braised',
  'organic', 'ripe', 'unripe', 'young', 'mature', 'aged',
  'red', 'green', 'yellow', 'white', 'black', 'brown', 'purple',
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

// Normalize ingredient name for matching
export function normalizeIngredientName(name: string): string {
  const lower = name.toLowerCase()
  // Remove quantities like "400g", "1 cup", "2 lbs", "1/2", "○400g", etc.
  const withoutQuantities = lower
    .replace(/^[○•·\-\s]*\d+[\d./]*\s*(g|kg|ml|l|oz|lb|lbs|cup|cups|tbsp|tsp|tablespoon|teaspoon|pound|pounds|ounce|ounces)?\s*/i, '')
    .replace(/\b\d+[\d./]*\s*(g|kg|ml|l|oz|lb|lbs|cup|cups|tbsp|tsp|tablespoon|teaspoon|pound|pounds|ounce|ounces)\b/gi, '')
  const descriptorPattern = new RegExp(`\\b(${DESCRIPTORS.join('|')})\\b`, 'g')
  return withoutQuantities.replace(descriptorPattern, '').replace(/\s+/g, ' ').trim()
}

// Get core ingredient (main noun, with synonym resolution)
function getCoreIngredient(name: string): string {
  const cleaned = normalizeIngredientName(name)
  const words = cleaned.split(' ')
  const lastWord = words[words.length - 1]
  return SYNONYMS[lastWord] || SYNONYMS[cleaned] || lastWord
}

// Check if user has an ingredient (flexible matching with fuzzy support)
export function hasIngredient(
  recipeIngredient: string,
  userIngredients: string[]
): boolean {
  const recipeName = normalizeIngredientName(recipeIngredient)
  const recipeCore = getCoreIngredient(recipeIngredient)
  const recipeWords = recipeName.split(' ').filter((w) => w.length > 2)

  for (const userIng of userIngredients) {
    const userName = normalizeIngredientName(userIng)
    const userCore = getCoreIngredient(userIng)
    const userWords = userName.split(' ').filter((w) => w.length > 2)

    // Check core ingredient match (with fuzzy matching for typos)
    if (recipeCore.length > 2 && userCore.length > 2) {
      if (recipeCore === userCore || isSimilar(recipeCore, userCore)) {
        return true
      }
    }

    // Check for exact or fuzzy matching on full names
    if (recipeName === userName || isSimilar(recipeName, userName)) {
      return true
    }

    // Check substring matches (for longer strings)
    if (recipeName.length >= 4 && userName.length >= 4) {
      if (recipeName.includes(userName) || userName.includes(recipeName)) {
        return true
      }
    }

    // Check word-level matches with fuzzy support
    for (const rWord of recipeWords) {
      for (const uWord of userWords) {
        if (rWord === uWord) return true
        if (rWord.length >= 4 && uWord.length >= 4) {
          if (isSimilar(rWord, uWord)) return true
          if (rWord.includes(uWord) || uWord.includes(rWord)) return true
        }
      }
    }
  }

  return false
}

// Calculate match statistics for a recipe
export function calculateRecipeMatch(
  recipe: UserRecipeWithIngredients,
  userIngredients: string[]
): UserRecipeWithMatch {
  const ingredientsWithMatch = recipe.recipe_ingredients.map((ing) => ({
    ...ing,
    inStock: hasIngredient(ing.name, userIngredients),
  }))

  const matchedCount = ingredientsWithMatch.filter((i) => i.inStock).length
  const totalIngredients = ingredientsWithMatch.length

  return {
    ...recipe,
    ingredientsWithMatch,
    matchedCount,
    totalIngredients,
    matchPercentage:
      totalIngredients > 0
        ? Math.round((matchedCount / totalIngredients) * 100)
        : 0,
  }
}
