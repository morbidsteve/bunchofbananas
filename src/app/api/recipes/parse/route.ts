import { NextRequest, NextResponse } from 'next/server'
import type { ParsedRecipeData, ParsedIngredient } from '@/types/recipes'

// POST: Parse recipe text into structured data
export async function POST(request: NextRequest) {
  const { text } = await request.json()

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 })
  }

  const parsed = parseRecipeText(text)

  return NextResponse.json(parsed)
}

function parseRecipeText(text: string): ParsedRecipeData {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  let title = ''
  const ingredients: ParsedIngredient[] = []
  let instructionLines: string[] = []
  let inIngredients = false
  let inInstructions = false

  const ingredientSectionPatterns = /^ingredients?:?$/i
  const instructionSectionPatterns =
    /^(instructions?|directions?|method|steps?|preparation|how to make):?$/i

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip empty or very short lines
    if (line.length < 2) continue

    // Detect title (usually first substantial non-section-header line)
    if (
      !title &&
      !ingredientSectionPatterns.test(line) &&
      !instructionSectionPatterns.test(line) &&
      !looksLikeIngredient(line)
    ) {
      title = line
      continue
    }

    // Detect section headers
    if (ingredientSectionPatterns.test(line)) {
      inIngredients = true
      inInstructions = false
      continue
    }

    if (instructionSectionPatterns.test(line)) {
      inIngredients = false
      inInstructions = true
      continue
    }

    // Parse ingredients
    if (inIngredients && !inInstructions) {
      const ingredient = parseIngredientLine(line)
      if (ingredient) {
        ingredients.push(ingredient)
      }
    }

    // Collect instructions
    if (inInstructions) {
      // Clean up numbered steps
      const cleanedLine = line.replace(/^\d+[\.\)]\s*/, '')
      if (cleanedLine) {
        instructionLines.push(cleanedLine)
      }
    }
  }

  // If we didn't find explicit sections, try to auto-detect
  if (ingredients.length === 0 && instructionLines.length === 0) {
    const autoDetected = autoDetectSections(lines, title)
    ingredients.push(...autoDetected.ingredients)
    instructionLines = autoDetected.instructions
    if (!title && autoDetected.title) {
      title = autoDetected.title
    }
  }

  return {
    title: title || 'Untitled Recipe',
    ingredients,
    instructions:
      instructionLines.length > 0 ? instructionLines.join('\n\n') : text,
  }
}

function looksLikeIngredient(line: string): boolean {
  // Check if line starts with a number or fraction (likely an ingredient)
  return /^[\d½⅓⅔¼¾⅛⅜⅝⅞\/]+/.test(line)
}

function parseIngredientLine(line: string): ParsedIngredient | null {
  // Remove bullet points, dashes, numbers at start
  const cleaned = line.replace(/^[\-\*\•\d.)\]]+\s*/, '').trim()

  if (!cleaned) return null

  // Try to extract quantity, unit, and ingredient name
  // Common pattern: "2 cups flour" or "1/2 tsp salt" or "3 large eggs"
  const measureMatch = cleaned.match(
    /^([\d\/.½⅓⅔¼¾⅛⅜⅝⅞]+(?:\s*-\s*[\d\/.½⅓⅔¼¾⅛⅜⅝⅞]+)?)\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|pinch|dash|cans?|packages?|pkgs?|cloves?|stalks?|heads?|bunches?|sprigs?|slices?|pieces?)\.?\s+(.+)/i
  )

  if (measureMatch) {
    const [, quantity, unit, rest] = measureMatch
    // Check for notes in parentheses
    const notesMatch = rest.match(/^(.+?)\s*\((.+)\)$/)
    if (notesMatch) {
      return {
        quantity: quantity.trim(),
        unit: unit.toLowerCase().replace(/s$/, ''), // Normalize unit
        name: notesMatch[1].trim(),
        notes: notesMatch[2].trim(),
      }
    }
    return {
      quantity: quantity.trim(),
      unit: unit.toLowerCase().replace(/s$/, ''),
      name: rest.trim(),
    }
  }

  // Try quantity without unit (e.g., "3 eggs")
  const qtyMatch = cleaned.match(
    /^([\d\/.½⅓⅔¼¾⅛⅜⅝⅞]+(?:\s*-\s*[\d\/.½⅓⅔¼¾⅛⅜⅝⅞]+)?)\s+(.+)/
  )
  if (qtyMatch) {
    const [, quantity, rest] = qtyMatch
    const notesMatch = rest.match(/^(.+?)\s*\((.+)\)$/)
    if (notesMatch) {
      return {
        quantity: quantity.trim(),
        name: notesMatch[1].trim(),
        notes: notesMatch[2].trim(),
      }
    }
    return {
      quantity: quantity.trim(),
      name: rest.trim(),
    }
  }

  // Just return the name if no quantity/unit found
  const notesMatch = cleaned.match(/^(.+?)\s*\((.+)\)$/)
  if (notesMatch) {
    return {
      name: notesMatch[1].trim(),
      notes: notesMatch[2].trim(),
    }
  }

  return { name: cleaned }
}

function autoDetectSections(
  lines: string[],
  existingTitle: string
): {
  title: string
  ingredients: ParsedIngredient[]
  instructions: string[]
} {
  const ingredients: ParsedIngredient[] = []
  const instructions: string[] = []
  let title = existingTitle

  // Heuristic: lines that look like ingredients vs instructions
  for (const line of lines) {
    if (line === title) continue

    // Skip section headers we might have missed
    if (/^(ingredients?|instructions?|directions?|method|steps?):?$/i.test(line))
      continue

    // Ingredients often start with numbers/fractions and are shorter
    if (looksLikeIngredient(line) && line.length < 80) {
      const parsed = parseIngredientLine(line)
      if (parsed) {
        ingredients.push(parsed)
        continue
      }
    }

    // Longer lines or lines with verbs are likely instructions
    if (
      line.length > 50 ||
      /\b(add|mix|stir|cook|bake|heat|pour|combine|whisk|fold|preheat|place|remove|let|serve)\b/i.test(
        line
      )
    ) {
      instructions.push(line.replace(/^\d+[\.\)]\s*/, ''))
      continue
    }

    // Short lines without numbers could be either
    if (!title && ingredients.length === 0 && instructions.length === 0) {
      title = line
    } else if (ingredients.length > 0 && instructions.length === 0) {
      // Might still be an ingredient
      const parsed = parseIngredientLine(line)
      if (parsed) {
        ingredients.push(parsed)
      }
    } else {
      instructions.push(line)
    }
  }

  return { title, ingredients, instructions }
}
