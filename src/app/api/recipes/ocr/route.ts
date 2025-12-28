import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limit'

// POST: Upload recipe image to storage
// OCR processing will be done client-side with Tesseract.js
export async function POST(request: NextRequest) {
  // Rate limiting for expensive image upload operations
  const clientIP = getClientIP(request.headers)
  const rateLimit = checkRateLimit(`ocr:${clientIP}`, RATE_LIMITS.expensive)

  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many uploads. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)),
        },
      }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const image = formData.get('image') as File

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    // Validate file type
    if (!image.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      )
    }

    // Limit file size to 10MB
    if (image.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Image must be less than 10MB' },
        { status: 400 }
      )
    }

    // Create unique filename
    const ext = image.name.split('.').pop() || 'jpg'
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`

    // Convert to buffer
    const buffer = Buffer.from(await image.arrayBuffer())

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('recipe-images')
      .upload(fileName, buffer, {
        contentType: image.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload image' },
        { status: 500 }
      )
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from('recipe-images').getPublicUrl(fileName)

    return NextResponse.json({
      success: true,
      imagePath: fileName,
      imageUrl: publicUrl,
    })
  } catch (error) {
    console.error('OCR upload error:', error)
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 }
    )
  }
}
