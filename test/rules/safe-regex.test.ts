/**
 * Tests for Safe Regex Utility Module
 *
 * These tests verify that the ReDoS (Regular Expression Denial of Service)
 * protection works correctly by:
 * 1. Rejecting dangerous regex patterns
 * 2. Allowing safe patterns
 * 3. Handling execution timeouts
 * 4. Maintaining backward compatibility with existing rules
 */

import { describe, it, expect } from 'vitest'
import {
  validateRegexPattern,
  safeRegexTest,
  safeRegexReplace,
  createSafeRegex,
  escapeRegex,
  RegexSecurityError,
} from '../../src/rules/safe-regex'

describe('Safe Regex - ReDoS Protection', () => {
  describe('validateRegexPattern', () => {
    describe('should reject dangerous patterns', () => {
      it('should reject nested quantifiers like (a+)+', () => {
        const result = validateRegexPattern('(a+)+')
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('exponential backtracking')
      })

      it('should reject nested quantifiers like (a*)*', () => {
        const result = validateRegexPattern('(a*)*')
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('exponential backtracking')
      })

      it('should reject nested quantifiers with explicit count like (a+){2,}', () => {
        const result = validateRegexPattern('(a+){2,}')
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('exponential backtracking')
      })

      it('should reject overlapping alternations with quantifiers like (a|aa)+', () => {
        const result = validateRegexPattern('(a|aa)+')
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('exponential backtracking')
      })

      it('should reject adjacent greedy quantifiers like .*.*', () => {
        const result = validateRegexPattern('.*.*')
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('exponential backtracking')
      })

      it('should reject adjacent greedy quantifiers like .+.+', () => {
        const result = validateRegexPattern('.+.+')
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('exponential backtracking')
      })

      it('should reject deeply nested groups with quantifiers', () => {
        const result = validateRegexPattern('((a+)+)+')
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('exponential backtracking')
      })

      it('should reject patterns exceeding max length', () => {
        const longPattern = 'a'.repeat(2000)
        const result = validateRegexPattern(longPattern, { maxPatternLength: 1000 })
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('maximum length')
      })

      it('should reject patterns with excessive quantifier values', () => {
        const result = validateRegexPattern('a{1000}', { maxQuantifier: 100 })
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('Quantifier value')
      })

      it('should reject patterns with too many groups', () => {
        const manyGroups = '(a)'.repeat(30)
        const result = validateRegexPattern(manyGroups, { maxGroups: 20 })
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('groups')
      })

      it('should reject lookahead with quantifiers inside', () => {
        const result = validateRegexPattern('(?=a+b+)c')
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('lookahead')
      })
    })

    describe('should accept safe patterns', () => {
      it('should accept simple literal patterns', () => {
        const result = validateRegexPattern('hello')
        expect(result.valid).toBe(true)
      })

      it('should accept patterns with anchors', () => {
        const result = validateRegexPattern('^hello$')
        expect(result.valid).toBe(true)
      })

      it('should accept patterns with single quantifiers', () => {
        const result = validateRegexPattern('a+')
        expect(result.valid).toBe(true)
      })

      it('should accept patterns with character classes', () => {
        const result = validateRegexPattern('[a-zA-Z0-9]+')
        expect(result.valid).toBe(true)
      })

      it('should accept email validation pattern', () => {
        const result = validateRegexPattern('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$')
        expect(result.valid).toBe(true)
      })

      it('should accept phone number pattern', () => {
        const result = validateRegexPattern('^\\+[0-9-]+$')
        expect(result.valid).toBe(true)
      })

      it('should accept UUID pattern', () => {
        const result = validateRegexPattern('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        expect(result.valid).toBe(true)
      })

      it('should accept slug pattern', () => {
        const result = validateRegexPattern('^[a-z0-9-]+$')
        expect(result.valid).toBe(true)
      })

      it('should accept username pattern', () => {
        const result = validateRegexPattern('^[a-zA-Z0-9_]+$')
        expect(result.valid).toBe(true)
      })

      it('should accept non-greedy quantifiers', () => {
        const result = validateRegexPattern('.*?')
        expect(result.valid).toBe(true)
      })

      it('should accept alternation without nested quantifiers', () => {
        const result = validateRegexPattern('cat|dog|bird')
        expect(result.valid).toBe(true)
      })
    })

    describe('should catch invalid regex syntax', () => {
      it('should reject unbalanced parentheses', () => {
        const result = validateRegexPattern('(abc')
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('Invalid regex syntax')
      })

      it('should reject invalid character class', () => {
        const result = validateRegexPattern('[z-a]')
        expect(result.valid).toBe(false)
        expect(result.reason).toContain('Invalid regex syntax')
      })
    })
  })

  describe('safeRegexTest', () => {
    it('should return true for matching patterns', () => {
      const result = safeRegexTest('^hello', 'hello world')
      expect(result.success).toBe(true)
      expect(result.result).toBe(true)
    })

    it('should return false for non-matching patterns', () => {
      const result = safeRegexTest('^goodbye', 'hello world')
      expect(result.success).toBe(true)
      expect(result.result).toBe(false)
    })

    it('should reject dangerous patterns', () => {
      const result = safeRegexTest('(a+)+', 'aaaaaa')
      expect(result.success).toBe(false)
      expect(result.rejectedForSafety).toBe(true)
    })

    it('should reject input exceeding max length', () => {
      const longInput = 'a'.repeat(20000)
      const result = safeRegexTest('a+', longInput)
      expect(result.success).toBe(false)
      expect(result.rejectedForSafety).toBe(true)
      expect(result.error).toContain('maximum length')
    })

    it('should work with email validation', () => {
      const pattern = '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'

      const validResult = safeRegexTest(pattern, 'user@example.com')
      expect(validResult.success).toBe(true)
      expect(validResult.result).toBe(true)

      const invalidResult = safeRegexTest(pattern, 'not-an-email')
      expect(invalidResult.success).toBe(true)
      expect(invalidResult.result).toBe(false)
    })

    it('should work with username validation', () => {
      const pattern = '^[a-zA-Z0-9_]+$'

      const validResult = safeRegexTest(pattern, 'john_doe123')
      expect(validResult.success).toBe(true)
      expect(validResult.result).toBe(true)

      const invalidResult = safeRegexTest(pattern, 'john@doe')
      expect(invalidResult.success).toBe(true)
      expect(invalidResult.result).toBe(false)
    })
  })

  describe('safeRegexReplace', () => {
    it('should replace matching patterns', () => {
      const result = safeRegexReplace('[0-9]+', 'abc123def456', 'X')
      expect(result.success).toBe(true)
      expect(result.result).toBe('abcXdefX')
    })

    it('should return original string when pattern does not match', () => {
      const result = safeRegexReplace('[0-9]+', 'abcdef', 'X')
      expect(result.success).toBe(true)
      expect(result.result).toBe('abcdef')
    })

    it('should reject dangerous patterns', () => {
      const result = safeRegexReplace('(a+)+', 'aaaaaa', 'X')
      expect(result.success).toBe(false)
      expect(result.rejectedForSafety).toBe(true)
    })

    it('should reject overly long replacement strings', () => {
      const longReplacement = 'X'.repeat(2000)
      const result = safeRegexReplace('a', 'abc', longReplacement)
      expect(result.success).toBe(false)
      expect(result.rejectedForSafety).toBe(true)
      expect(result.error).toContain('Replacement string')
    })
  })

  describe('createSafeRegex', () => {
    it('should create regex for safe patterns', () => {
      const regex = createSafeRegex('^hello$')
      expect(regex).toBeInstanceOf(RegExp)
      expect(regex.test('hello')).toBe(true)
    })

    it('should throw RegexSecurityError for dangerous patterns', () => {
      expect(() => createSafeRegex('(a+)+')).toThrow(RegexSecurityError)
    })

    it('should support flags', () => {
      const regex = createSafeRegex('hello', 'i')
      expect(regex.test('HELLO')).toBe(true)
    })
  })

  describe('escapeRegex', () => {
    it('should escape special characters', () => {
      const escaped = escapeRegex('hello.world')
      expect(escaped).toBe('hello\\.world')
    })

    it('should escape all regex metacharacters', () => {
      const input = '.*+?^${}()|[]\\'
      const escaped = escapeRegex(input)
      const regex = new RegExp(escaped)
      expect(regex.test(input)).toBe(true)
    })

    it('should not modify strings without special characters', () => {
      const input = 'helloworld123'
      expect(escapeRegex(input)).toBe(input)
    })
  })

  describe('Integration with Firebase Rules patterns', () => {
    it('should handle common Firebase Rules patterns safely', () => {
      // Email validation
      expect(safeRegexTest('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$', 'user@example.com').result).toBe(true)

      // Phone number
      expect(safeRegexTest('^\\+[0-9-]+$', '+1-555-123-4567').result).toBe(true)

      // UUID
      expect(safeRegexTest('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', '123e4567-e89b-12d3-a456-426614174000').result).toBe(true)

      // Slug
      expect(safeRegexTest('^[a-z0-9-]+$', 'my-blog-post-title').result).toBe(true)

      // URL path
      expect(safeRegexTest('^/[a-zA-Z0-9/_-]+$', '/users/profile/settings').result).toBe(true)
    })

    it('should block ReDoS attack patterns that could be used in malicious rules', () => {
      // These patterns could cause exponential backtracking if allowed
      const dangerousPatterns = [
        '(a+)+$',           // Classic ReDoS
        '(a|a)+$',          // Overlapping alternation
        '([a-zA-Z]+)*$',    // Nested word quantifier
        '(.*a){10}',        // Repeated greedy pattern
        '((a+)+)+',         // Deeply nested
      ]

      for (const pattern of dangerousPatterns) {
        const result = safeRegexTest(pattern, 'aaaaaaaaaaaaaaaaaaaaaaaaa!')
        expect(result.success).toBe(false)
        expect(result.rejectedForSafety).toBe(true)
      }
    })
  })
})
