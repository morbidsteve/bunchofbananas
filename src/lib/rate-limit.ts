// Simple in-memory rate limiter for API routes
// For production with multiple instances, consider using Redis

interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // Clean every minute

export interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetTime: number
}

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier for the client (e.g., IP address, user ID)
 * @param config - Rate limit configuration
 * @returns Result indicating if the request is allowed
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitStore.get(identifier)

  // If no entry or window expired, create new entry
  if (!entry || entry.resetTime < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + config.windowMs,
    }
    rateLimitStore.set(identifier, newEntry)
    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetTime: newEntry.resetTime,
    }
  }

  // Increment counter
  entry.count++
  rateLimitStore.set(identifier, entry)

  // Check if over limit
  if (entry.count > config.maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetTime: entry.resetTime,
    }
  }

  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
  }
}

/**
 * Get client IP from request headers
 */
export function getClientIP(headers: Headers): string {
  // Check for forwarded headers (when behind proxy/load balancer)
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIP = headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  // Fallback for development
  return 'unknown'
}

// Pre-configured rate limiters for different use cases
export const RATE_LIMITS = {
  // Standard API calls - 100 requests per minute
  standard: { windowMs: 60 * 1000, maxRequests: 100 },

  // Recipe suggest - more lenient since it's a heavy operation
  recipeSuggest: { windowMs: 60 * 1000, maxRequests: 30 },

  // Auth endpoints - stricter to prevent brute force
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 10 },

  // Invite endpoints - prevent spam
  invite: { windowMs: 60 * 60 * 1000, maxRequests: 10 },

  // OCR/Parse - expensive operations
  expensive: { windowMs: 60 * 1000, maxRequests: 10 },
}
