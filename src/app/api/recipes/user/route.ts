import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeIngredientName } from '@/types/recipes'

// Input validation constants
const MAX_TITLE_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 2000
const MAX_INSTRUCTIONS_LENGTH = 50000
const MAX_CATEGORY_LENGTH = 100
const MAX_CUISINE_LENGTH = 100
const MAX_URL_LENGTH = 2000
const MAX_INGREDIENTS = 100
const MAX_INGREDIENT_NAME_LENGTH = 200
const MAX_SEARCH_LENGTH = 100

function truncate(str: string | null | undefined, maxLength: number): string | null {
  if (!str) return null
  return str.slice(0, maxLength)
}

// GET: List user's recipes with optional filtering
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's household(s)
  const { data: memberships } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ recipes: [] })
  }

  const householdIds = memberships.map((m) => m.household_id)

  const { searchParams } = new URL(request.url)
  const category = truncate(searchParams.get('category'), MAX_CATEGORY_LENGTH)
  const cuisine = truncate(searchParams.get('cuisine'), MAX_CUISINE_LENGTH)
  const search = truncate(searchParams.get('search'), MAX_SEARCH_LENGTH)

  let query = supabase
    .from('user_recipes')
    .select(
      `
      *,
      recipe_ingredients (*)
    `
    )
    .in('household_id', householdIds)
    .order('created_at', { ascending: false })

  if (category) {
    query = query.eq('category', category)
  }

  if (cuisine) {
    query = query.eq('cuisine', cuisine)
  }

  if (search) {
    query = query.ilike('title', `%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ recipes: data })
}

// POST: Create a new recipe
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's household
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No household found' }, { status: 400 })
  }

  const body = await request.json()
  const {
    title,
    description,
    instructions,
    ingredients,
    category,
    cuisine,
    prepTime,
    cookTime,
    servings,
    sourceType,
    sourceUrl,
    originalText,
    imagePath,
  } = body

  if (!title || !instructions) {
    return NextResponse.json(
      { error: 'Title and instructions are required' },
      { status: 400 }
    )
  }

  // Validate input lengths
  if (typeof title !== 'string' || title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json(
      { error: `Title must be ${MAX_TITLE_LENGTH} characters or less` },
      { status: 400 }
    )
  }

  if (typeof instructions !== 'string' || instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    return NextResponse.json(
      { error: `Instructions must be ${MAX_INSTRUCTIONS_LENGTH} characters or less` },
      { status: 400 }
    )
  }

  if (ingredients && (!Array.isArray(ingredients) || ingredients.length > MAX_INGREDIENTS)) {
    return NextResponse.json(
      { error: `Maximum ${MAX_INGREDIENTS} ingredients allowed` },
      { status: 400 }
    )
  }

  // Create recipe with sanitized inputs
  const { data: recipe, error: recipeError } = await supabase
    .from('user_recipes')
    .insert({
      household_id: membership.household_id,
      created_by: user.id,
      title: title.slice(0, MAX_TITLE_LENGTH),
      description: truncate(description, MAX_DESCRIPTION_LENGTH),
      instructions: instructions.slice(0, MAX_INSTRUCTIONS_LENGTH),
      category: truncate(category, MAX_CATEGORY_LENGTH),
      cuisine: truncate(cuisine, MAX_CUISINE_LENGTH),
      prep_time_minutes: prepTime ? parseInt(prepTime) : null,
      cook_time_minutes: cookTime ? parseInt(cookTime) : null,
      servings: servings ? parseInt(servings) : null,
      source_type: sourceType || 'manual',
      source_url: truncate(sourceUrl, MAX_URL_LENGTH),
      original_text: originalText || null,
      image_path: imagePath || null,
    })
    .select()
    .single()

  if (recipeError) {
    return NextResponse.json({ error: recipeError.message }, { status: 500 })
  }

  // Create ingredients
  if (ingredients && Array.isArray(ingredients) && ingredients.length > 0) {
    const ingredientRows = ingredients.slice(0, MAX_INGREDIENTS).map(
      (
        ing: { name: string; quantity?: string; unit?: string; notes?: string },
        idx: number
      ) => {
        const name = String(ing.name || '').slice(0, MAX_INGREDIENT_NAME_LENGTH)
        return {
          recipe_id: recipe.id,
          name,
          quantity: ing.quantity ? String(ing.quantity).slice(0, 50) : null,
          unit: ing.unit ? String(ing.unit).slice(0, 50) : null,
          notes: ing.notes ? String(ing.notes).slice(0, 500) : null,
          position: idx,
          normalized_name: normalizeIngredientName(name),
        }
      }
    )

    const { error: ingError } = await supabase
      .from('recipe_ingredients')
      .insert(ingredientRows)

    if (ingError) {
      // Rollback recipe creation
      await supabase.from('user_recipes').delete().eq('id', recipe.id)
      return NextResponse.json({ error: ingError.message }, { status: 500 })
    }
  }

  // Fetch the complete recipe with ingredients
  const { data: completeRecipe } = await supabase
    .from('user_recipes')
    .select(
      `
      *,
      recipe_ingredients (*)
    `
    )
    .eq('id', recipe.id)
    .single()

  return NextResponse.json({ recipe: completeRecipe })
}
