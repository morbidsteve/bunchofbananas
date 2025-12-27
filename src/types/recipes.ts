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

// Normalize ingredient name for matching (same logic as API)
export function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(large|small|medium|fresh|dried|chopped|minced|diced|sliced|whole|ground|crushed|organic|raw|cooked|frozen|canned|ripe|unripe)\b/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
}

// Check if user has an ingredient (flexible matching)
export function hasIngredient(
  recipeIngredient: string,
  userIngredients: string[]
): boolean {
  const recipeName = normalizeIngredientName(recipeIngredient)
  const recipeWords = recipeName.split(' ').filter((w) => w.length > 2)

  for (const userIng of userIngredients) {
    const userName = normalizeIngredientName(userIng)
    const userWords = userName.split(' ').filter((w) => w.length > 2)

    // Check for any matching terms
    if (recipeName === userName) return true
    if (recipeName.includes(userName) || userName.includes(recipeName))
      return true

    // Check word-level matches
    for (const rWord of recipeWords) {
      for (const uWord of userWords) {
        if (rWord === uWord || rWord.includes(uWord) || uWord.includes(rWord)) {
          return true
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
