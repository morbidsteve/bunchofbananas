import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeIngredientName } from '@/types/recipes'

// GET: List user's recipes with optional filtering
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const cuisine = searchParams.get('cuisine')
  const search = searchParams.get('search')

  let query = supabase
    .from('user_recipes')
    .select(
      `
      *,
      recipe_ingredients (*)
    `
    )
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

  // Create recipe
  const { data: recipe, error: recipeError } = await supabase
    .from('user_recipes')
    .insert({
      household_id: membership.household_id,
      created_by: user.id,
      title,
      description: description || null,
      instructions,
      category: category || null,
      cuisine: cuisine || null,
      prep_time_minutes: prepTime ? parseInt(prepTime) : null,
      cook_time_minutes: cookTime ? parseInt(cookTime) : null,
      servings: servings ? parseInt(servings) : null,
      source_type: sourceType || 'manual',
      source_url: sourceUrl || null,
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
    const ingredientRows = ingredients.map(
      (
        ing: { name: string; quantity?: string; unit?: string; notes?: string },
        idx: number
      ) => ({
        recipe_id: recipe.id,
        name: ing.name,
        quantity: ing.quantity || null,
        unit: ing.unit || null,
        notes: ing.notes || null,
        position: idx,
        normalized_name: normalizeIngredientName(ing.name),
      })
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
