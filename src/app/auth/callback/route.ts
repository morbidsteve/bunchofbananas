import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Allowed redirect paths to prevent open redirect attacks
const ALLOWED_PATHS = [
  '/dashboard',
  '/dashboard/storage',
  '/dashboard/inventory',
  '/dashboard/items',
  '/dashboard/recipes',
  '/dashboard/prices',
  '/dashboard/shopping',
  '/dashboard/settings',
]

/**
 * Validate and sanitize the redirect path
 * Only allows internal paths that start with / and are on the allowed list or sub-paths
 */
function getSafeRedirectPath(next: string | null): string {
  const defaultPath = '/dashboard'

  if (!next) return defaultPath

  // Remove any protocol/host attempts (prevents //evil.com attacks)
  const sanitized = next.replace(/^[a-zA-Z]+:\/\/[^/]+/, '').replace(/^\/\/+/, '/')

  // Must start with /
  if (!sanitized.startsWith('/')) return defaultPath

  // Check against allowed paths (exact match or sub-path)
  const isAllowed = ALLOWED_PATHS.some(
    (allowed) => sanitized === allowed || sanitized.startsWith(`${allowed}/`)
  )

  // Also allow /invite/ paths for accepting invitations
  const isInvitePath = sanitized.startsWith('/invite/')

  if (isAllowed || isInvitePath) {
    return sanitized
  }

  return defaultPath
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  // Validate redirect path to prevent open redirects
  const safeRedirect = getSafeRedirectPath(next)

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${safeRedirect}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate`)
}
