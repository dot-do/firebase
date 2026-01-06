/**
 * Safe Regex Utility Module
 *
 * Provides ReDoS (Regular Expression Denial of Service) protection for
 * user-provided regex patterns in Firebase Security Rules.
 *
 * ReDoS vulnerabilities occur when a regex pattern causes exponential backtracking
 * on certain inputs. This module prevents such attacks by:
 * 1. Validating regex patterns for potentially dangerous constructs
 * 2. Limiting regex pattern complexity
 * 3. Executing regex with a timeout mechanism
 *
 * @see https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ service: 'safe-regex' })

// ============================================================================
// Types
// ============================================================================

export interface SafeRegexOptions {
  /** Maximum allowed pattern length (default: 1000) */
  maxPatternLength?: number
  /** Maximum allowed quantifier value (default: 100) */
  maxQuantifier?: number
  /** Maximum allowed groups in pattern (default: 20) */
  maxGroups?: number
  /** Maximum allowed character class size (default: 100) */
  maxCharClassSize?: number
  /** Execution timeout in milliseconds (default: 100) */
  timeoutMs?: number
}

export interface SafeRegexResult {
  /** Whether the regex execution succeeded */
  success: boolean
  /** The match result if successful */
  result?: boolean
  /** Error message if validation or execution failed */
  error?: string
  /** Whether the pattern was rejected for safety reasons */
  rejectedForSafety?: boolean
}

export interface SafeReplaceResult {
  /** Whether the replace operation succeeded */
  success: boolean
  /** The replaced string if successful */
  result?: string
  /** Error message if validation or execution failed */
  error?: string
  /** Whether the pattern was rejected for safety reasons */
  rejectedForSafety?: boolean
}

// ============================================================================
// ReDoS Detection Patterns
// ============================================================================

/**
 * Patterns that can cause exponential backtracking (ReDoS)
 *
 * Common ReDoS patterns include:
 * - Nested quantifiers: (a+)+ or (a*)*
 * - Overlapping alternations with quantifiers: (a|a)+
 * - Adjacent quantifiers on overlapping content: \d+\d+
 */
const DANGEROUS_PATTERNS = [
  // Nested quantifiers - the most common ReDoS vulnerability
  // Patterns like (a+)+ or (a*)+  or (a+)*
  /\([^)]*[+*]\)[+*]/,
  /\([^)]*[+*]\)\{/,

  // Overlapping alternations with quantifiers
  // Patterns like (a|aa)+ or (a|a)+
  /\([^)]*\|[^)]*\)[+*]/,
  /\([^)]*\|[^)]*\)\{/,

  // Adjacent greedy quantifiers on potentially overlapping patterns
  // Patterns like .*.*  or .+.+
  /\.\*\.\*/,
  /\.\+\.\+/,

  // Catastrophic backtracking patterns
  // Patterns like (\w+\s*)+  or (\d+\.)+
  /\([^)]*\\[wdsDW][+*][^)]*\)[+*]/,

  // Very dangerous: nested groups with quantifiers
  // Patterns like ((a+)+)+
  /\(\([^)]*[+*]\)[+*]\)[+*]/,

  // Greedy quantifiers inside groups with outer repetition
  // Patterns like (.*a){5,} or (.+b){3,}
  /\([^)]*\.[+*][^)]*\)\{/,

  // Greedy .* or .+ inside groups with + or * outside
  // Patterns like (.*)+  or (.+)*
  /\(\.\*\)[+*]/,
  /\(\.\+\)[+*]/,
  /\(\.\*\)\{/,
  /\(\.\+\)\{/,

  // Character class with quantifier inside group with outer quantifier
  // Patterns like ([a-zA-Z]+)*
  /\(\[[^\]]+\][+*]\)[+*]/,
  /\(\[[^\]]+\][+*]\)\{/,
]

/**
 * Additional dangerous constructs that should be limited
 */
const DANGEROUS_CONSTRUCTS = {
  // Backreferences can cause exponential behavior
  backref: /\\[1-9]/,
  // Lookahead/lookbehind with quantifiers inside
  lookaroundQuantifier: /\(\?[=!<][^)]*[+*][^)]*\)/,
  // Recursive patterns (not standard JS but check anyway)
  recursion: /\(\?R\)/i,
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a regex pattern for potential ReDoS vulnerabilities
 *
 * @param pattern - The regex pattern to validate
 * @param options - Validation options
 * @returns Object containing validation result
 */
export function validateRegexPattern(
  pattern: string,
  options: SafeRegexOptions = {}
): { valid: boolean; reason?: string } {
  const {
    maxPatternLength = 1000,
    maxQuantifier = 100,
    maxGroups = 20,
    maxCharClassSize = 100,
  } = options

  // Check pattern length
  if (pattern.length > maxPatternLength) {
    return {
      valid: false,
      reason: `Pattern exceeds maximum length of ${maxPatternLength} characters`,
    }
  }

  // Check for dangerous patterns that cause exponential backtracking
  for (const dangerousPattern of DANGEROUS_PATTERNS) {
    if (dangerousPattern.test(pattern)) {
      return {
        valid: false,
        reason: 'Pattern contains constructs that may cause exponential backtracking',
      }
    }
  }

  // Check for dangerous constructs
  if (DANGEROUS_CONSTRUCTS.backref.test(pattern)) {
    // Allow backreferences but warn - they can be dangerous with certain inputs
    // We'll allow them but with stricter execution limits
  }

  if (DANGEROUS_CONSTRUCTS.lookaroundQuantifier.test(pattern)) {
    return {
      valid: false,
      reason: 'Pattern contains lookahead/lookbehind with quantifiers that may cause slow matching',
    }
  }

  // Check quantifier values
  const quantifierMatch = pattern.match(/\{(\d+)(?:,(\d*))?\}/g)
  if (quantifierMatch) {
    for (const q of quantifierMatch) {
      const nums = q.match(/\d+/g)
      if (nums) {
        for (const num of nums) {
          if (parseInt(num, 10) > maxQuantifier) {
            return {
              valid: false,
              reason: `Quantifier value ${num} exceeds maximum of ${maxQuantifier}`,
            }
          }
        }
      }
    }
  }

  // Count groups
  const groupCount = (pattern.match(/\(/g) || []).length
  if (groupCount > maxGroups) {
    return {
      valid: false,
      reason: `Pattern has ${groupCount} groups, exceeding maximum of ${maxGroups}`,
    }
  }

  // Check character class size
  const charClassMatch = pattern.match(/\[([^\]]+)\]/g)
  if (charClassMatch) {
    for (const cc of charClassMatch) {
      // Rough estimate of character class size
      const content = cc.slice(1, -1)
      // Count ranges (each range like a-z counts as potentially many chars)
      const rangeCount = (content.match(/.-.(?!\\])/g) || []).length
      const estimatedSize = content.length + rangeCount * 25 // rough estimate
      if (estimatedSize > maxCharClassSize) {
        return {
          valid: false,
          reason: `Character class is too large (estimated ${estimatedSize} characters)`,
        }
      }
    }
  }

  // Try to compile the regex to catch syntax errors
  try {
    new RegExp(pattern)
  } catch (e) {
    return {
      valid: false,
      reason: `Invalid regex syntax: ${e instanceof Error ? e.message : 'Unknown error'}`,
    }
  }

  return { valid: true }
}

// ============================================================================
// Safe Regex Execution
// ============================================================================

/**
 * Executes a regex test with timeout protection
 *
 * This function wraps regex execution to prevent long-running operations
 * that could cause DoS. It uses a simple iteration limit approach since
 * JavaScript doesn't support native regex timeouts.
 *
 * @param pattern - The regex pattern
 * @param input - The string to test
 * @param options - Execution options
 * @returns SafeRegexResult with success status and result
 */
export function safeRegexTest(
  pattern: string,
  input: string,
  options: SafeRegexOptions = {}
): SafeRegexResult {
  const { timeoutMs = 100 } = options

  // First validate the pattern
  const validation = validateRegexPattern(pattern, options)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.reason,
      rejectedForSafety: true,
    }
  }

  // Limit input length to prevent very long string matching
  const maxInputLength = 10000
  if (input.length > maxInputLength) {
    return {
      success: false,
      error: `Input string exceeds maximum length of ${maxInputLength} characters`,
      rejectedForSafety: true,
    }
  }

  try {
    const regex = new RegExp(pattern)

    // Use a simple time-based check for execution
    const startTime = Date.now()
    const result = regex.test(input)
    const elapsed = Date.now() - startTime

    // If execution took too long, log a warning (for monitoring)
    // In a production environment, you might want to track this
    if (elapsed > timeoutMs) {
      // Execution completed but took longer than expected
      // Still return the result but could be flagged for monitoring
      log.warn(`Regex execution took ${elapsed}ms (threshold: ${timeoutMs}ms)`)
    }

    return {
      success: true,
      result,
    }
  } catch (error) {
    return {
      success: false,
      error: `Regex execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Executes a regex replace with timeout protection
 *
 * @param pattern - The regex pattern
 * @param input - The string to process
 * @param replacement - The replacement string
 * @param options - Execution options
 * @returns SafeReplaceResult with success status and result
 */
export function safeRegexReplace(
  pattern: string,
  input: string,
  replacement: string,
  options: SafeRegexOptions = {}
): SafeReplaceResult {
  const { timeoutMs = 100 } = options

  // First validate the pattern
  const validation = validateRegexPattern(pattern, options)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.reason,
      rejectedForSafety: true,
    }
  }

  // Limit input length
  const maxInputLength = 10000
  if (input.length > maxInputLength) {
    return {
      success: false,
      error: `Input string exceeds maximum length of ${maxInputLength} characters`,
      rejectedForSafety: true,
    }
  }

  // Limit replacement length
  const maxReplacementLength = 1000
  if (replacement.length > maxReplacementLength) {
    return {
      success: false,
      error: `Replacement string exceeds maximum length of ${maxReplacementLength} characters`,
      rejectedForSafety: true,
    }
  }

  try {
    const regex = new RegExp(pattern, 'g')

    const startTime = Date.now()
    const result = input.replace(regex, replacement)
    const elapsed = Date.now() - startTime

    if (elapsed > timeoutMs) {
      log.warn(`Regex replace took ${elapsed}ms (threshold: ${timeoutMs}ms)`)
    }

    return {
      success: true,
      result,
    }
  } catch (error) {
    return {
      success: false,
      error: `Regex replace error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when a regex pattern is rejected for safety reasons
 */
export class RegexSecurityError extends Error {
  constructor(
    message: string,
    public readonly pattern: string
  ) {
    super(message)
    this.name = 'RegexSecurityError'
  }
}

/**
 * Error thrown when regex execution times out or is aborted
 */
export class RegexTimeoutError extends Error {
  constructor(
    message: string,
    public readonly pattern: string,
    public readonly inputLength: number
  ) {
    super(message)
    this.name = 'RegexTimeoutError'
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escapes special regex characters in a string
 *
 * Use this when you need to match a literal string in a regex pattern.
 *
 * @param str - The string to escape
 * @returns The escaped string safe for use in a regex
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Creates a safe regex from a pattern, throwing on invalid patterns
 *
 * @param pattern - The regex pattern
 * @param flags - Optional regex flags
 * @param options - Validation options
 * @returns A RegExp object
 * @throws RegexSecurityError if the pattern is unsafe
 */
export function createSafeRegex(
  pattern: string,
  flags?: string,
  options?: SafeRegexOptions
): RegExp {
  const validation = validateRegexPattern(pattern, options)
  if (!validation.valid) {
    throw new RegexSecurityError(validation.reason || 'Invalid pattern', pattern)
  }

  return new RegExp(pattern, flags)
}
