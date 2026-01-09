// Fuzzy string matching utilities for receipt item matching

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate Levenshtein similarity (0-1 scale, 1 = identical)
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshteinDistance(a, b) / maxLen
}

/**
 * Tokenize a string into a set of words
 */
export function tokenize(str: string): Set<string> {
  return new Set(
    str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1)
  )
}

/**
 * Calculate Jaccard similarity between two sets
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)))
  const union = new Set([...a, ...b])
  return union.size > 0 ? intersection.size / union.size : 0
}

// Common receipt abbreviations mapped to full words
const ABBREVIATIONS: Record<string, string[]> = {
  'org': ['organic'],
  'bnls': ['boneless'],
  'sklss': ['skinless'],
  'chkn': ['chicken'],
  'brst': ['breast'],
  'thgh': ['thigh'],
  'whl': ['whole'],
  'whlmlk': ['whole', 'milk'],
  'skim': ['skim'],
  'ff': ['fat', 'free'],
  'lf': ['low', 'fat'],
  'rf': ['reduced', 'fat'],
  'gal': ['gallon'],
  'gln': ['gallon'],
  'qt': ['quart'],
  'pt': ['pint'],
  'oz': ['ounce'],
  'lb': ['pound'],
  'lbs': ['pounds'],
  'pk': ['pack'],
  'ct': ['count'],
  'lg': ['large'],
  'sm': ['small'],
  'md': ['medium'],
  'med': ['medium'],
  'frz': ['frozen'],
  'frzn': ['frozen'],
  'frsh': ['fresh'],
  'grn': ['green'],
  'rd': ['red'],
  'wht': ['white'],
  'brn': ['brown'],
  'yel': ['yellow'],
  'veg': ['vegetable'],
  'vegs': ['vegetables'],
  'frt': ['fruit'],
  'jce': ['juice'],
  'brd': ['bread'],
  'cer': ['cereal'],
  'yog': ['yogurt'],
  'ygrt': ['yogurt'],
  'chz': ['cheese'],
  'chs': ['cheese'],
  'btr': ['butter'],
  'egg': ['eggs'],
  'mlk': ['milk'],
  'crm': ['cream'],
  'ice': ['ice'],
  'icrm': ['ice', 'cream'],
  'cof': ['coffee'],
  'cffe': ['coffee'],
  'tea': ['tea'],
  'sda': ['soda'],
  'wtr': ['water'],
  'spk': ['sparkling'],
  'sprk': ['sparkling'],
  'nat': ['natural'],
  'ntrl': ['natural'],
  'prem': ['premium'],
  'val': ['value'],
  'sav': ['savings'],
  'dsc': ['discount'],
  'sel': ['select'],
  'chc': ['choice'],
  'prm': ['prime'],
}

/**
 * Expand abbreviations in a string
 */
export function expandAbbreviations(str: string): string {
  const words = str.toLowerCase().split(/\s+/)
  const expanded: string[] = []

  for (const word of words) {
    if (ABBREVIATIONS[word]) {
      expanded.push(...ABBREVIATIONS[word])
    } else {
      expanded.push(word)
    }
  }

  return expanded.join(' ')
}

/**
 * Normalize an item name for comparison
 */
export function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Calculate match score between receipt item and known item name
 * Returns 0-1 score where 1 is a perfect match
 */
export function calculateMatchScore(receiptItem: string, itemName: string): number {
  // Normalize both strings
  const normalizedReceipt = normalizeItemName(receiptItem)
  const normalizedItem = normalizeItemName(itemName)

  // Try with abbreviation expansion
  const expandedReceipt = expandAbbreviations(normalizedReceipt)
  const expandedItem = expandAbbreviations(normalizedItem)

  // Calculate both raw and expanded scores
  const rawLevScore = levenshteinSimilarity(normalizedReceipt, normalizedItem)
  const rawTokenScore = jaccardSimilarity(tokenize(normalizedReceipt), tokenize(normalizedItem))

  const expLevScore = levenshteinSimilarity(expandedReceipt, expandedItem)
  const expTokenScore = jaccardSimilarity(tokenize(expandedReceipt), tokenize(expandedItem))

  // Weight token matching higher (60%) since receipt names are often truncated
  const rawScore = 0.4 * rawLevScore + 0.6 * rawTokenScore
  const expScore = 0.4 * expLevScore + 0.6 * expTokenScore

  // Return the better of the two scores
  return Math.max(rawScore, expScore)
}

export interface MatchCandidate {
  id: string
  name: string
  source: 'shopping_list' | 'inventory' | 'items'
  shoppingListId?: string
  inventoryId?: string
  shelfId?: string
}

export interface BestMatch {
  candidate: MatchCandidate
  score: number
  confidence: 'high' | 'low'
}

const MIN_THRESHOLD = 0.3
const HIGH_CONFIDENCE_THRESHOLD = 0.6

/**
 * Find the best matching candidate for a receipt item
 */
export function findBestMatch(
  receiptItem: string,
  candidates: MatchCandidate[]
): BestMatch | null {
  let bestMatch: BestMatch | null = null
  let bestScore = MIN_THRESHOLD

  for (const candidate of candidates) {
    const score = calculateMatchScore(receiptItem, candidate.name)
    if (score > bestScore) {
      bestScore = score
      bestMatch = {
        candidate,
        score,
        confidence: score >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'low',
      }
    }
  }

  return bestMatch
}

/**
 * Find all matches above the minimum threshold, sorted by score
 */
export function findAllMatches(
  receiptItem: string,
  candidates: MatchCandidate[]
): BestMatch[] {
  const matches: BestMatch[] = []

  for (const candidate of candidates) {
    const score = calculateMatchScore(receiptItem, candidate.name)
    if (score > MIN_THRESHOLD) {
      matches.push({
        candidate,
        score,
        confidence: score >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'low',
      })
    }
  }

  // Sort by score descending
  return matches.sort((a, b) => b.score - a.score)
}
