import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeIngredientName } from '@/types/recipes'

// Input validation constants (same as POST route)
const MAX_TITLE_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 2000
const MAX_INSTRUCTIONS_LENGTH = 50000
const MAX_CATEGORY_LENGTH = 100
const MAX_CUISINE_LENGTH = 100
const MAX_INGREDIENTS = 100
const MAX_INGREDIENT_NAME_LENGTH = 200

function truncate(str: string | null | undefined, maxLength: number): string | null {
  if (!str) return null
  return str.slice(0, maxLength)
}

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET: Get a single recipe by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()

  const { data: recipe, error } = await supabase
    .from('user_recipes')
    .select(
      `
      *,
      recipe_ingredients (*)
    `
    )
    .eq('id', id)
    .single()

  if (error || !recipe) {
    return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
  }

  // Allow access if recipe is public
  if (recipe.is_public) {
    return NextResponse.json({ recipe })
  }

  // For private recipes, require authentication and household membership
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user is in the same household as the recipe
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .eq('household_id', recipe.household_id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Not authorized to view this recipe' }, { status: 403 })
  }

  return NextResponse.json({ recipe })
}

// PUT: Update a recipe
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user owns this recipe
  const { data: existingRecipe } = await supabase
    .from('user_recipes')
    .select('id, created_by')
    .eq('id', id)
    .single()

  if (!existingRecipe) {
    return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
  }

  if (existingRecipe.created_by !== user.id) {
    return NextResponse.json(
      { error: 'Not authorized to edit this recipe' },
      { status: 403 }
    )
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
    imagePath,
    isPublic,
  } = body

  // Validate required fields
  if (!title || !instructions) {
    return NextResponse.json(
      { error: 'Title and instructions are required' },
      { status: 400 }
    )
  }

  // Validate input types and lengths
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

  // Update recipe with sanitized inputs
  const { error: updateError } = await supabase
    .from('user_recipes')
    .update({
      title: title.slice(0, MAX_TITLE_LENGTH),
      description: truncate(description, MAX_DESCRIPTION_LENGTH),
      instructions: instructions.slice(0, MAX_INSTRUCTIONS_LENGTH),
      category: truncate(category, MAX_CATEGORY_LENGTH),
      cuisine: truncate(cuisine, MAX_CUISINE_LENGTH),
      prep_time_minutes: prepTime ? parseInt(prepTime) : null,
      cook_time_minutes: cookTime ? parseInt(cookTime) : null,
      servings: servings ? parseInt(servings) : null,
      image_path: imagePath || null,
      is_public: isPublic ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Update ingredients if provided
  if (ingredients && Array.isArray(ingredients)) {
    // Delete existing ingredients
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)

    // Insert new ingredients with sanitized data
    if (ingredients.length > 0) {
      const ingredientRows = ingredients.slice(0, MAX_INGREDIENTS).map(
        (
          ing: {
            name: string
            quantity?: string
            unit?: string
            notes?: string
          },
          idx: number
        ) => {
          const name = String(ing.name || '').slice(0, MAX_INGREDIENT_NAME_LENGTH)
          return {
            recipe_id: id,
            name,
            quantity: ing.quantity ? String(ing.quantity).slice(0, 50) : null,
            unit: ing.unit ? String(ing.unit).slice(0, 50) : null,
            notes: ing.notes ? String(ing.notes).slice(0, 500) : null,
            position: idx,
            normalized_name: normalizeIngredientName(name),
          }
        }
      )

      await supabase.from('recipe_ingredients').insert(ingredientRows)
    }
  }

  // Fetch updated recipe
  const { data: updatedRecipe } = await supabase
    .from('user_recipes')
    .select(
      `
      *,
      recipe_ingredients (*)
    `
    )
    .eq('id', id)
    .single()

  return NextResponse.json({ recipe: updatedRecipe })
}

// DELETE: Delete a recipe
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user owns this recipe
  const { data: existingRecipe } = await supabase
    .from('user_recipes')
    .select('id, created_by')
    .eq('id', id)
    .single()

  if (!existingRecipe) {
    return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
  }

  if (existingRecipe.created_by !== user.id) {
    return NextResponse.json(
      { error: 'Not authorized to delete this recipe' },
      { status: 403 }
    )
  }

  // Delete recipe (ingredients will cascade)
  const { error } = await supabase.from('user_recipes').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
