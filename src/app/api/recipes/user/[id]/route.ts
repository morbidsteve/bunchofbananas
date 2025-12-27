import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeIngredientName } from '@/types/recipes'

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

  if (error) {
    return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
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

  // Update recipe
  const { error: updateError } = await supabase
    .from('user_recipes')
    .update({
      title,
      description: description || null,
      instructions,
      category: category || null,
      cuisine: cuisine || null,
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

    // Insert new ingredients
    if (ingredients.length > 0) {
      const ingredientRows = ingredients.map(
        (
          ing: {
            name: string
            quantity?: string
            unit?: string
            notes?: string
          },
          idx: number
        ) => ({
          recipe_id: id,
          name: ing.name,
          quantity: ing.quantity || null,
          unit: ing.unit || null,
          notes: ing.notes || null,
          position: idx,
          normalized_name: normalizeIngredientName(ing.name),
        })
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
