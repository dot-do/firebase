/**
 * Firebase Security Rules Path Matching
 *
 * This module implements path pattern matching for Firebase Security Rules.
 * It supports:
 * - Literal path segments: /users/documents
 * - Single-segment wildcards: /users/{userId}
 * - Recursive wildcards: /users/{path=**}
 * - Collection group queries
 *
 * Reference: https://firebase.google.com/docs/firestore/security/rules-structure
 */

// ============================================================================
// Types
// ============================================================================

export interface PathMatchResult {
  matches: boolean
  wildcards: Record<string, string>
}

/**
 * Represents a parsed segment from a path pattern.
 */
type PathSegment =
  | { type: 'literal'; value: string }
  | { type: 'wildcard'; name: string }
  | { type: 'recursive'; name: string }

// ============================================================================
// Path Parsing
// ============================================================================

/**
 * Normalizes a path by removing leading/trailing slashes and empty segments.
 * @param path - The path to normalize
 * @returns Normalized path segments
 */
function normalizePath(path: string): string[] {
  if (!path || path === '/') {
    return []
  }

  return path
    .split('/')
    .filter(segment => segment.length > 0)
}

/**
 * Parses a path pattern into segments.
 * @param pattern - The pattern to parse (e.g., "/users/{userId}")
 * @returns Array of parsed segments
 */
function parsePattern(pattern: string): PathSegment[] {
  const segments = normalizePath(pattern)
  const result: PathSegment[] = []

  for (const segment of segments) {
    if (segment.startsWith('{') && segment.endsWith('}')) {
      // Extract the content within the curly braces
      const content = segment.slice(1, -1).trim()

      // Check for recursive wildcard pattern: {name=**}
      const recursiveMatch = content.match(/^(\w+)\s*=\s*\*\*$/)
      if (recursiveMatch) {
        result.push({
          type: 'recursive',
          name: recursiveMatch[1]
        })
      } else {
        // Single-segment wildcard
        result.push({
          type: 'wildcard',
          name: content
        })
      }
    } else {
      // Literal segment
      result.push({
        type: 'literal',
        value: segment
      })
    }
  }

  return result
}

// ============================================================================
// Path Matching
// ============================================================================

/**
 * Matches a document path against a security rules pattern.
 *
 * @param pattern - The security rules pattern (e.g., "/users/{userId}")
 * @param path - The actual document path (e.g., "/users/alice")
 * @returns PathMatchResult with match status and extracted wildcards
 *
 * @example
 * ```typescript
 * const result = matchPath('/users/{userId}', '/users/alice')
 * // { matches: true, wildcards: { userId: 'alice' } }
 * ```
 */
export function matchPath(pattern: string, path: string): PathMatchResult {
  const patternSegments = parsePattern(pattern)
  const pathSegments = normalizePath(path)
  const wildcards: Record<string, string> = {}

  // Handle empty paths
  if (pathSegments.length === 0 && patternSegments.length === 0) {
    return { matches: true, wildcards: {} }
  }

  if (pathSegments.length === 0 || patternSegments.length === 0) {
    return { matches: false, wildcards: {} }
  }

  let patternIndex = 0
  let pathIndex = 0

  while (patternIndex < patternSegments.length) {
    const patternSeg = patternSegments[patternIndex]

    if (patternSeg.type === 'literal') {
      // Literal segment must match exactly
      if (pathIndex >= pathSegments.length || pathSegments[pathIndex] !== patternSeg.value) {
        return { matches: false, wildcards: {} }
      }
      patternIndex++
      pathIndex++
    } else if (patternSeg.type === 'wildcard') {
      // Single-segment wildcard matches exactly one segment
      if (pathIndex >= pathSegments.length) {
        return { matches: false, wildcards: {} }
      }
      wildcards[patternSeg.name] = pathSegments[pathIndex]
      patternIndex++
      pathIndex++
    } else if (patternSeg.type === 'recursive') {
      // Recursive wildcard matches one or more segments
      // Check if this is the last pattern segment
      if (patternIndex === patternSegments.length - 1) {
        // Match all remaining path segments
        if (pathIndex >= pathSegments.length) {
          // Recursive wildcard must match at least one segment
          return { matches: false, wildcards: {} }
        }
        const remainingPath = pathSegments.slice(pathIndex).join('/')
        wildcards[patternSeg.name] = remainingPath
        return { matches: true, wildcards }
      } else {
        // Recursive wildcard in the middle - not typically used in Firebase rules
        // but we should handle it gracefully
        // For now, consume remaining segments
        if (pathIndex >= pathSegments.length) {
          return { matches: false, wildcards: {} }
        }
        const remainingPath = pathSegments.slice(pathIndex).join('/')
        wildcards[patternSeg.name] = remainingPath
        patternIndex++
        pathIndex = pathSegments.length
      }
    }
  }

  // All pattern segments matched - check if all path segments were consumed
  if (pathIndex !== pathSegments.length) {
    return { matches: false, wildcards: {} }
  }

  return { matches: true, wildcards }
}

/**
 * Checks if a path matches a collection group pattern.
 * Collection group patterns match subcollections at any depth.
 *
 * @param collectionId - The collection ID to match (e.g., "reviews")
 * @param path - The actual document path
 * @returns PathMatchResult with match status and extracted wildcards
 *
 * @example
 * ```typescript
 * const result = matchCollectionGroup('reviews', '/products/prod1/reviews/review1')
 * // { matches: true, wildcards: { document: 'review1' } }
 * ```
 */
export function matchCollectionGroup(collectionId: string, path: string): PathMatchResult {
  const pathSegments = normalizePath(path)

  // A valid collection group path must have at least 2 segments: collection/document
  if (pathSegments.length < 2) {
    return { matches: false, wildcards: {} }
  }

  // Check if the second-to-last segment matches the collection ID
  const collectionIndex = pathSegments.length - 2
  if (pathSegments[collectionIndex] !== collectionId) {
    return { matches: false, wildcards: {} }
  }

  // Extract the document ID (last segment)
  const documentId = pathSegments[pathSegments.length - 1]

  return {
    matches: true,
    wildcards: {
      document: documentId
    }
  }
}

/**
 * Extracts wildcard values from a matched path.
 * This is a convenience function that combines matchPath with wildcard extraction.
 *
 * @param pattern - The security rules pattern
 * @param path - The actual document path
 * @returns The extracted wildcards, or null if the path doesn't match
 *
 * @example
 * ```typescript
 * const wildcards = extractWildcards('/users/{userId}/posts/{postId}', '/users/alice/posts/post1')
 * // { userId: 'alice', postId: 'post1' }
 * ```
 */
export function extractWildcards(pattern: string, path: string): Record<string, string> | null {
  const result = matchPath(pattern, path)
  return result.matches ? result.wildcards : null
}

/**
 * Checks if a pattern contains any wildcards.
 *
 * @param pattern - The pattern to check
 * @returns True if the pattern contains wildcards, false otherwise
 */
export function hasWildcards(pattern: string): boolean {
  return pattern.includes('{')
}

/**
 * Extracts all wildcard names from a pattern.
 *
 * @param pattern - The pattern to analyze
 * @returns Array of wildcard names in the pattern
 *
 * @example
 * ```typescript
 * const names = getWildcardNames('/users/{userId}/posts/{postId}')
 * // ['userId', 'postId']
 * ```
 */
export function getWildcardNames(pattern: string): string[] {
  const segments = parsePattern(pattern)
  const names: string[] = []

  for (const segment of segments) {
    if (segment.type === 'wildcard' || segment.type === 'recursive') {
      names.push(segment.name)
    }
  }

  return names
}

/**
 * Validates whether a pattern is well-formed.
 *
 * @param pattern - The pattern to validate
 * @returns True if the pattern is valid, false otherwise
 */
export function isValidPattern(pattern: string): boolean {
  try {
    // Check for balanced curly braces
    let braceDepth = 0
    for (const char of pattern) {
      if (char === '{') braceDepth++
      if (char === '}') braceDepth--
      if (braceDepth < 0) return false
    }
    if (braceDepth !== 0) return false

    // Try to parse the pattern
    parsePattern(pattern)
    return true
  } catch {
    return false
  }
}
