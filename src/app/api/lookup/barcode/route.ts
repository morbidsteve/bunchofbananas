import { NextRequest, NextResponse } from 'next/server'

interface OpenFoodFactsProduct {
  product_name?: string
  brands?: string
  categories?: string
  nutriscore_grade?: string
  nutriments?: {
    'energy-kcal_100g'?: number
    proteins_100g?: number
    carbohydrates_100g?: number
    fat_100g?: number
    fiber_100g?: number
    sugars_100g?: number
    sodium_100g?: number
  }
}

interface ProductInfo {
  name: string
  brand: string | null
  category: string | null
  barcode: string
  nutriscore: string | null
  nutrition: {
    calories: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
    fiber_g: number | null
    sugar_g: number | null
    sodium_mg: number | null
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const barcode = searchParams.get('barcode')

  if (!barcode) {
    return NextResponse.json(
      { error: 'Barcode is required' },
      { status: 400 }
    )
  }

  try {
    // Query Open Food Facts API
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      {
        headers: {
          'User-Agent': 'BunchOfBananas/1.0 (contact@example.com)',
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch product data')
    }

    const data = await response.json()

    if (data.status !== 1 || !data.product) {
      return NextResponse.json(
        { found: false, message: 'Product not found in database' },
        { status: 200 }
      )
    }

    const product: OpenFoodFactsProduct = data.product
    const nutriments = product.nutriments || {}

    const productInfo: ProductInfo = {
      name: product.product_name || 'Unknown Product',
      brand: product.brands || null,
      category: product.categories?.split(',')[0]?.trim() || null,
      barcode,
      nutriscore: product.nutriscore_grade?.toUpperCase() || null,
      nutrition: {
        calories: nutriments['energy-kcal_100g'] ?? null,
        protein_g: nutriments.proteins_100g ?? null,
        carbs_g: nutriments.carbohydrates_100g ?? null,
        fat_g: nutriments.fat_100g ?? null,
        fiber_g: nutriments.fiber_100g ?? null,
        sugar_g: nutriments.sugars_100g ?? null,
        sodium_mg: nutriments.sodium_100g ? nutriments.sodium_100g * 1000 : null, // Convert g to mg
      },
    }

    return NextResponse.json({
      found: true,
      product: productInfo,
    })
  } catch (error) {
    console.error('Barcode lookup error:', error)
    return NextResponse.json(
      { error: 'Failed to lookup product' },
      { status: 500 }
    )
  }
}
