/**
 * Tests for Firebase Security Rules Built-in Functions
 *
 * Firebase Security Rules provide built-in functions for:
 * - Document access: get(), exists(), getAfter()
 * - Math operations: math.abs(), math.ceil(), math.floor(), math.round()
 * - String operations: matches(), size(), split()
 * - List operations: hasAny(), hasAll(), size()
 * - Timestamp operations: toMillis()
 * - Duration utilities: value()
 *
 * @see https://firebase.google.com/docs/rules/rules-language
 * @see https://firebase.google.com/docs/reference/rules/rules
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createPath,
  createRulesContext,
  createRulesString,
  createRulesList,
  createRulesTimestamp,
  createRulesDuration,
  type RulesResource,
  type RulesTimestamp,
  type RulesDuration,
  type RulesPath,
  type RulesContext,
  type RulesString,
  type RulesList,
  type RulesSet,
} from '../../src/rules/builtins'

// Document store for testing
let documentStore: Map<string, RulesResource>
let pendingWrites: Map<string, RulesResource | null>

describe('Firebase Security Rules Built-in Functions', () => {
  let ctx: RulesContext

  beforeEach(() => {
    documentStore = new Map()
    pendingWrites = new Map()
    ctx = createRulesContext(documentStore, pendingWrites)
  })

  describe('get(path) - Document Access', () => {
    it('should fetch document at specified path and return resource', () => {
      // Setup: Create a document in the store
      const docPath = '/databases/(default)/documents/users/user123'
      documentStore.set(docPath, {
        __name__: docPath,
        id: 'user123',
        data: { name: 'John Doe', email: 'john@example.com' },
      })

      const path = createPath(docPath)
      const resource = ctx.get(path)

      expect(resource).not.toBeNull()
      expect(resource?.id).toBe('user123')
      expect(resource?.data.name).toBe('John Doe')
    })

    it('should return null for non-existent document', () => {
      const path = createPath('/databases/(default)/documents/users/nonexistent')
      const resource = ctx.get(path)

      expect(resource).toBeNull()
    })

    it('should access nested document paths', () => {
      const docPath = '/databases/(default)/documents/users/user123/posts/post456'
      documentStore.set(docPath, {
        __name__: docPath,
        id: 'post456',
        data: { title: 'My Post', content: 'Hello World' },
      })

      const path = createPath(docPath)
      const resource = ctx.get(path)

      expect(resource).not.toBeNull()
      expect(resource?.id).toBe('post456')
      expect(resource?.data.title).toBe('My Post')
    })

    it('should include __name__ property with full document path', () => {
      const docPath = '/databases/(default)/documents/users/user123'
      documentStore.set(docPath, {
        __name__: docPath,
        id: 'user123',
        data: { name: 'Test User' },
      })

      const path = createPath(docPath)
      const resource = ctx.get(path)

      expect(resource?.__name__).toBe(docPath)
    })

    it('should access documents in different collections', () => {
      const userPath = '/databases/(default)/documents/users/user123'
      const orderPath = '/databases/(default)/documents/orders/order789'

      documentStore.set(userPath, {
        __name__: userPath,
        id: 'user123',
        data: { name: 'User' },
      })
      documentStore.set(orderPath, {
        __name__: orderPath,
        id: 'order789',
        data: { total: 99.99 },
      })

      const userResource = ctx.get(createPath(userPath))
      const orderResource = ctx.get(createPath(orderPath))

      expect(userResource?.data.name).toBe('User')
      expect(orderResource?.data.total).toBe(99.99)
    })
  })

  describe('exists(path) - Document Existence Check', () => {
    it('should return true if document exists', () => {
      const docPath = '/databases/(default)/documents/users/user123'
      documentStore.set(docPath, {
        __name__: docPath,
        id: 'user123',
        data: { name: 'Test User' },
      })

      const path = createPath(docPath)
      const result = ctx.exists(path)

      expect(result).toBe(true)
    })

    it('should return false if document does not exist', () => {
      const path = createPath('/databases/(default)/documents/users/nonexistent')
      const result = ctx.exists(path)

      expect(result).toBe(false)
    })

    it('should return false for empty collection path', () => {
      const path = createPath('/databases/(default)/documents/emptyCollection/doc1')
      const result = ctx.exists(path)

      expect(result).toBe(false)
    })

    it('should handle nested document existence check', () => {
      const docPath = '/databases/(default)/documents/users/user123/settings/preferences'
      documentStore.set(docPath, {
        __name__: docPath,
        id: 'preferences',
        data: { theme: 'dark' },
      })

      const existsPath = createPath(docPath)
      const notExistsPath = createPath('/databases/(default)/documents/users/user123/settings/other')

      expect(ctx.exists(existsPath)).toBe(true)
      expect(ctx.exists(notExistsPath)).toBe(false)
    })

    it('should distinguish between document with data and deleted document', () => {
      const docPath = '/databases/(default)/documents/users/user123'

      // Document doesn't exist initially
      expect(ctx.exists(createPath(docPath))).toBe(false)

      // Add document
      documentStore.set(docPath, {
        __name__: docPath,
        id: 'user123',
        data: {},
      })

      expect(ctx.exists(createPath(docPath))).toBe(true)

      // Delete document
      documentStore.delete(docPath)

      expect(ctx.exists(createPath(docPath))).toBe(false)
    })
  })

  describe('getAfter(path) - Post-Write Document State', () => {
    it('should get document state after current write in transaction', () => {
      const docPath = '/databases/(default)/documents/users/user123'

      // Current state
      documentStore.set(docPath, {
        __name__: docPath,
        id: 'user123',
        data: { balance: 100 },
      })

      // Pending write in transaction
      pendingWrites.set(docPath, {
        __name__: docPath,
        id: 'user123',
        data: { balance: 150 },
      })

      const path = createPath(docPath)
      const afterResource = ctx.getAfter(path)

      expect(afterResource).not.toBeNull()
      expect(afterResource?.data.balance).toBe(150)
    })

    it('should return new document state for create operation', () => {
      const docPath = '/databases/(default)/documents/users/newuser'

      // Document doesn't exist yet
      expect(documentStore.has(docPath)).toBe(false)

      // Pending create
      pendingWrites.set(docPath, {
        __name__: docPath,
        id: 'newuser',
        data: { name: 'New User', createdAt: Date.now() },
      })

      const path = createPath(docPath)
      const afterResource = ctx.getAfter(path)

      expect(afterResource).not.toBeNull()
      expect(afterResource?.data.name).toBe('New User')
    })

    it('should return null for document being deleted', () => {
      const docPath = '/databases/(default)/documents/users/user123'

      // Current state exists
      documentStore.set(docPath, {
        __name__: docPath,
        id: 'user123',
        data: { name: 'To Be Deleted' },
      })

      // Mark for deletion (null indicates delete)
      pendingWrites.set(docPath, null as unknown as RulesResource)

      const path = createPath(docPath)
      const afterResource = ctx.getAfter(path)

      expect(afterResource).toBeNull()
    })

    it('should work with batch writes affecting multiple documents', () => {
      const doc1Path = '/databases/(default)/documents/accounts/acc1'
      const doc2Path = '/databases/(default)/documents/accounts/acc2'

      // Current states
      documentStore.set(doc1Path, {
        __name__: doc1Path,
        id: 'acc1',
        data: { balance: 1000 },
      })
      documentStore.set(doc2Path, {
        __name__: doc2Path,
        id: 'acc2',
        data: { balance: 500 },
      })

      // Batch transfer: acc1 -> acc2
      pendingWrites.set(doc1Path, {
        __name__: doc1Path,
        id: 'acc1',
        data: { balance: 800 },
      })
      pendingWrites.set(doc2Path, {
        __name__: doc2Path,
        id: 'acc2',
        data: { balance: 700 },
      })

      const acc1After = ctx.getAfter(createPath(doc1Path))
      const acc2After = ctx.getAfter(createPath(doc2Path))

      expect(acc1After?.data.balance).toBe(800)
      expect(acc2After?.data.balance).toBe(700)
    })

    it('should fall back to current state if no pending write', () => {
      const docPath = '/databases/(default)/documents/users/user123'

      documentStore.set(docPath, {
        __name__: docPath,
        id: 'user123',
        data: { status: 'active' },
      })

      // No pending write for this document
      const path = createPath(docPath)
      const afterResource = ctx.getAfter(path)

      // Should return current state when no pending write
      expect(afterResource?.data.status).toBe('active')
    })
  })

  describe('math.abs() - Absolute Value', () => {
    it('should return absolute value of positive number', () => {
      expect(ctx.math.abs(5)).toBe(5)
    })

    it('should return absolute value of negative number', () => {
      expect(ctx.math.abs(-5)).toBe(5)
    })

    it('should return 0 for zero', () => {
      expect(ctx.math.abs(0)).toBe(0)
    })

    it('should handle floating point numbers', () => {
      expect(ctx.math.abs(-3.14159)).toBeCloseTo(3.14159)
    })

    it('should handle very large numbers', () => {
      expect(ctx.math.abs(-1e15)).toBe(1e15)
    })

    it('should handle very small numbers', () => {
      expect(ctx.math.abs(-1e-10)).toBeCloseTo(1e-10)
    })
  })

  describe('math.ceil() - Ceiling Function', () => {
    it('should round up positive decimal to next integer', () => {
      expect(ctx.math.ceil(4.1)).toBe(5)
    })

    it('should return same value for positive integer', () => {
      expect(ctx.math.ceil(4.0)).toBe(4)
    })

    it('should round up negative decimal toward zero', () => {
      expect(ctx.math.ceil(-4.1)).toBe(-4)
    })

    it('should return same value for negative integer', () => {
      expect(ctx.math.ceil(-4.0)).toBe(-4)
    })

    it('should handle very small positive decimals', () => {
      expect(ctx.math.ceil(0.001)).toBe(1)
    })

    it('should handle very small negative decimals', () => {
      expect(ctx.math.ceil(-0.001)).toBe(0)
    })
  })

  describe('math.floor() - Floor Function', () => {
    it('should round down positive decimal to previous integer', () => {
      expect(ctx.math.floor(4.9)).toBe(4)
    })

    it('should return same value for positive integer', () => {
      expect(ctx.math.floor(4.0)).toBe(4)
    })

    it('should round down negative decimal away from zero', () => {
      expect(ctx.math.floor(-4.1)).toBe(-5)
    })

    it('should return same value for negative integer', () => {
      expect(ctx.math.floor(-4.0)).toBe(-4)
    })

    it('should handle values between 0 and 1', () => {
      expect(ctx.math.floor(0.999)).toBe(0)
    })

    it('should handle values between -1 and 0', () => {
      expect(ctx.math.floor(-0.001)).toBe(-1)
    })
  })

  describe('math.round() - Rounding Function', () => {
    it('should round down when decimal < 0.5', () => {
      expect(ctx.math.round(4.4)).toBe(4)
    })

    it('should round up when decimal >= 0.5', () => {
      expect(ctx.math.round(4.5)).toBe(5)
    })

    it('should round exactly 0.5 up (banker rounding not used)', () => {
      expect(ctx.math.round(2.5)).toBe(3)
    })

    it('should handle negative numbers correctly', () => {
      expect(ctx.math.round(-4.5)).toBe(-4) // rounds toward positive infinity
    })

    it('should return same value for integer', () => {
      expect(ctx.math.round(7)).toBe(7)
    })

    it('should handle zero', () => {
      expect(ctx.math.round(0)).toBe(0)
    })
  })

  describe('string.matches(regex) - Regular Expression Matching', () => {
    it('should return true when string matches regex', () => {
      const str = createRulesString('hello@example.com')
      expect(str.matches('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$')).toBe(true)
    })

    it('should return false when string does not match regex', () => {
      const str = createRulesString('not-an-email')
      expect(str.matches('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$')).toBe(false)
    })

    it('should match simple patterns', () => {
      const str = createRulesString('hello world')
      expect(str.matches('hello')).toBe(true)
      expect(str.matches('goodbye')).toBe(false)
    })

    it('should support anchors', () => {
      const str = createRulesString('hello world')
      expect(str.matches('^hello')).toBe(true)
      expect(str.matches('world$')).toBe(true)
      expect(str.matches('^world')).toBe(false)
    })

    it('should support character classes', () => {
      const str = createRulesString('abc123')
      expect(str.matches('[a-z]+')).toBe(true)
      expect(str.matches('^[a-z]+$')).toBe(false) // contains digits
      expect(str.matches('^[a-z0-9]+$')).toBe(true)
    })

    it('should support quantifiers', () => {
      const str = createRulesString('aaabbb')
      expect(str.matches('a{3}')).toBe(true)
      expect(str.matches('a{4}')).toBe(false)
      expect(str.matches('a+b+')).toBe(true)
    })

    it('should support alternation', () => {
      const str = createRulesString('cat')
      expect(str.matches('cat|dog')).toBe(true)
      expect(str.matches('bird|fish')).toBe(false)
    })

    it('should handle empty string', () => {
      const str = createRulesString('')
      expect(str.matches('^$')).toBe(true)
      expect(str.matches('.+')).toBe(false)
    })
  })

  describe('string.size() - String Length', () => {
    it('should return length of non-empty string', () => {
      const str = createRulesString('hello')
      expect(str.size()).toBe(5)
    })

    it('should return 0 for empty string', () => {
      const str = createRulesString('')
      expect(str.size()).toBe(0)
    })

    it('should count unicode characters correctly', () => {
      const str = createRulesString('cafe')
      expect(str.size()).toBe(4)
    })

    it('should count emoji as correct number of code points', () => {
      // Note: Firebase rules count UTF-16 code units
      const str = createRulesString('\u{1F600}') // grinning face emoji
      // Emoji takes 2 UTF-16 code units (surrogate pair)
      expect(str.size()).toBe(2)
    })

    it('should handle whitespace correctly', () => {
      const str = createRulesString('  hello  ')
      expect(str.size()).toBe(9)
    })

    it('should handle special characters', () => {
      const str = createRulesString('hello\nworld\ttab')
      expect(str.size()).toBe(15)
    })
  })

  describe('string.split(delimiter) - String Splitting', () => {
    it('should split string by single character delimiter', () => {
      const str = createRulesString('a,b,c')
      expect(str.split(',')).toEqual(['a', 'b', 'c'])
    })

    it('should split string by multi-character delimiter', () => {
      const str = createRulesString('a::b::c')
      expect(str.split('::')).toEqual(['a', 'b', 'c'])
    })

    it('should return single-element array when delimiter not found', () => {
      const str = createRulesString('hello')
      expect(str.split(',')).toEqual(['hello'])
    })

    it('should handle empty segments', () => {
      const str = createRulesString('a,,b')
      expect(str.split(',')).toEqual(['a', '', 'b'])
    })

    it('should handle delimiter at start', () => {
      const str = createRulesString(',a,b')
      expect(str.split(',')).toEqual(['', 'a', 'b'])
    })

    it('should handle delimiter at end', () => {
      const str = createRulesString('a,b,')
      expect(str.split(',')).toEqual(['a', 'b', ''])
    })

    it('should handle empty string', () => {
      const str = createRulesString('')
      expect(str.split(',')).toEqual([''])
    })

    it('should split by whitespace', () => {
      const str = createRulesString('hello world foo')
      expect(str.split(' ')).toEqual(['hello', 'world', 'foo'])
    })
  })

  describe('list.hasAny(list) - List Contains Any', () => {
    it('should return true if list contains any element from input', () => {
      const list = createRulesList(['admin', 'editor', 'viewer'])
      expect(list.hasAny(['admin', 'superuser'])).toBe(true)
    })

    it('should return false if list contains no elements from input', () => {
      const list = createRulesList(['admin', 'editor', 'viewer'])
      expect(list.hasAny(['superuser', 'moderator'])).toBe(false)
    })

    it('should handle empty source list', () => {
      const list = createRulesList<string>([])
      expect(list.hasAny(['admin'])).toBe(false)
    })

    it('should handle empty input list', () => {
      const list = createRulesList(['admin'])
      expect(list.hasAny([])).toBe(false)
    })

    it('should handle numeric lists', () => {
      const list = createRulesList([1, 2, 3, 4, 5])
      expect(list.hasAny([3, 6, 9])).toBe(true)
      expect(list.hasAny([6, 7, 8])).toBe(false)
    })

    it('should handle single element match', () => {
      const list = createRulesList(['a', 'b', 'c'])
      expect(list.hasAny(['c'])).toBe(true)
    })

    it('should handle duplicate elements', () => {
      const list = createRulesList(['a', 'a', 'b'])
      expect(list.hasAny(['a'])).toBe(true)
    })
  })

  describe('list.hasAll(list) - List Contains All', () => {
    it('should return true if list contains all elements from input', () => {
      const list = createRulesList(['admin', 'editor', 'viewer', 'moderator'])
      expect(list.hasAll(['admin', 'editor'])).toBe(true)
    })

    it('should return false if list is missing any element from input', () => {
      const list = createRulesList(['admin', 'editor'])
      expect(list.hasAll(['admin', 'editor', 'viewer'])).toBe(false)
    })

    it('should return true for empty input list', () => {
      const list = createRulesList(['admin'])
      expect(list.hasAll([])).toBe(true)
    })

    it('should return false for empty source list with non-empty input', () => {
      const list = createRulesList<string>([])
      expect(list.hasAll(['admin'])).toBe(false)
    })

    it('should handle numeric lists', () => {
      const list = createRulesList([1, 2, 3, 4, 5])
      expect(list.hasAll([1, 3, 5])).toBe(true)
      expect(list.hasAll([1, 6])).toBe(false)
    })

    it('should handle exact match', () => {
      const list = createRulesList(['a', 'b', 'c'])
      expect(list.hasAll(['a', 'b', 'c'])).toBe(true)
    })

    it('should ignore duplicates in input', () => {
      const list = createRulesList(['a', 'b'])
      expect(list.hasAll(['a', 'a', 'b'])).toBe(true)
    })
  })

  describe('list.size() - List Length', () => {
    it('should return number of elements in list', () => {
      const list = createRulesList(['a', 'b', 'c'])
      expect(list.size()).toBe(3)
    })

    it('should return 0 for empty list', () => {
      const list = createRulesList([])
      expect(list.size()).toBe(0)
    })

    it('should count duplicate elements', () => {
      const list = createRulesList(['a', 'a', 'a'])
      expect(list.size()).toBe(3)
    })

    it('should handle large lists', () => {
      const items = Array.from({ length: 1000 }, (_, i) => i)
      const list = createRulesList(items)
      expect(list.size()).toBe(1000)
    })

    it('should handle mixed type lists', () => {
      const list = createRulesList([1, 'two', true, null])
      expect(list.size()).toBe(4)
    })

    it('should handle nested arrays', () => {
      const list = createRulesList([[1, 2], [3, 4], [5]])
      expect(list.size()).toBe(3)
    })
  })

  describe('timestamp.toMillis() - Timestamp to Milliseconds', () => {
    it('should convert timestamp to milliseconds since epoch', () => {
      const millis = 1704067200000 // 2024-01-01 00:00:00 UTC
      const timestamp = createRulesTimestamp(millis)
      expect(timestamp.toMillis()).toBe(millis)
    })

    it('should handle zero timestamp (Unix epoch)', () => {
      const timestamp = createRulesTimestamp(0)
      expect(timestamp.toMillis()).toBe(0)
    })

    it('should handle timestamps before Unix epoch (negative)', () => {
      const millis = -86400000 // 1 day before epoch
      const timestamp = createRulesTimestamp(millis)
      expect(timestamp.toMillis()).toBe(millis)
    })

    it('should preserve millisecond precision', () => {
      const millis = 1704067200123
      const timestamp = createRulesTimestamp(millis)
      expect(timestamp.toMillis()).toBe(millis)
    })

    it('should handle current time', () => {
      const now = Date.now()
      const timestamp = createRulesTimestamp(now)
      expect(timestamp.toMillis()).toBe(now)
    })

    it('should handle far future timestamps', () => {
      const millis = 4102444800000 // 2100-01-01
      const timestamp = createRulesTimestamp(millis)
      expect(timestamp.toMillis()).toBe(millis)
    })

    it('should be consistent with seconds and nanos properties', () => {
      const millis = 1704067200123
      const timestamp = createRulesTimestamp(millis)
      const computedMillis = timestamp.seconds * 1000 + Math.floor(timestamp.nanos / 1000000)
      // Note: This tests the relationship, but toMillis() still needs implementation
      expect(timestamp.toMillis()).toBe(computedMillis)
    })
  })

  describe('duration.value() - Duration Value Extraction', () => {
    it('should return duration value in seconds', () => {
      const duration = createRulesDuration(3600, 's')
      expect(duration.value('s')).toBe(3600)
    })

    it('should convert duration to milliseconds', () => {
      const duration = createRulesDuration(1, 's')
      expect(duration.value('ms')).toBe(1000)
    })

    it('should convert duration to minutes', () => {
      const duration = createRulesDuration(3600, 's')
      expect(duration.value('m')).toBe(60)
    })

    it('should convert duration to hours', () => {
      const duration = createRulesDuration(7200, 's')
      expect(duration.value('h')).toBe(2)
    })

    it('should convert duration to days', () => {
      const duration = createRulesDuration(172800, 's')
      expect(duration.value('d')).toBe(2)
    })

    it('should convert duration to weeks', () => {
      const duration = createRulesDuration(604800, 's')
      expect(duration.value('w')).toBe(1)
    })

    it('should convert duration to nanoseconds', () => {
      const duration = createRulesDuration(1, 's')
      expect(duration.value('ns')).toBe(1000000000)
    })

    it('should handle fractional values', () => {
      const duration = createRulesDuration(90, 's')
      expect(duration.value('m')).toBeCloseTo(1.5)
    })

    it('should handle zero duration', () => {
      const duration = createRulesDuration(0, 's')
      expect(duration.value('s')).toBe(0)
      expect(duration.value('ms')).toBe(0)
    })

    it('should handle negative duration', () => {
      const duration = createRulesDuration(-3600, 's')
      expect(duration.value('h')).toBe(-1)
    })
  })

  describe('Integration Tests - Combined Function Usage', () => {
    it('should validate document field length with string.size()', () => {
      const username = createRulesString('john_doe_123')
      const isValidLength = username.size() >= 3 && username.size() <= 20

      expect(isValidLength).toBe(true)
    })

    it('should validate email format with string.matches()', () => {
      const email = createRulesString('user@example.com')
      const emailRegex = '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'

      expect(email.matches(emailRegex)).toBe(true)
    })

    it('should check user roles with list.hasAny()', () => {
      const userRoles = createRulesList(['editor', 'viewer'])
      const requiredRoles = ['admin', 'editor']

      expect(userRoles.hasAny(requiredRoles)).toBe(true)
    })

    it('should verify all required permissions with list.hasAll()', () => {
      const userPermissions = createRulesList(['read', 'write', 'delete', 'admin'])
      const requiredPermissions = ['read', 'write']

      expect(userPermissions.hasAll(requiredPermissions)).toBe(true)
    })

    it('should validate numeric range with math functions', () => {
      const amount = 99.99
      const roundedAmount = ctx.math.round(amount)
      const isWithinRange = ctx.math.abs(amount) <= 1000

      expect(roundedAmount).toBe(100)
      expect(isWithinRange).toBe(true)
    })

    it('should cross-reference documents with get() and exists()', () => {
      const userPath = '/databases/(default)/documents/users/user123'
      const profilePath = '/databases/(default)/documents/profiles/user123'

      documentStore.set(userPath, {
        __name__: userPath,
        id: 'user123',
        data: { email: 'user@example.com' },
      })
      documentStore.set(profilePath, {
        __name__: profilePath,
        id: 'user123',
        data: { userId: 'user123', displayName: 'John' },
      })

      // Rule: User can only access profile if user document exists
      const userExists = ctx.exists(createPath(userPath))
      const profile = ctx.get(createPath(profilePath))

      expect(userExists).toBe(true)
      expect(profile?.data.userId).toBe('user123')
    })

    it('should validate timestamp-based access control', () => {
      const now = Date.now()
      const expirationMillis = now + 3600000 // 1 hour from now
      const expirationTimestamp = createRulesTimestamp(expirationMillis)
      const currentTimestamp = createRulesTimestamp(now)

      const isNotExpired = expirationTimestamp.toMillis() > currentTimestamp.toMillis()

      expect(isNotExpired).toBe(true)
    })

    it('should validate rate limiting with duration', () => {
      const lastAccessDuration = createRulesDuration(30, 's')
      const minIntervalSeconds = 60

      // User must wait at least 60 seconds between actions
      const isRateLimited = lastAccessDuration.value('s') < minIntervalSeconds

      expect(isRateLimited).toBe(true)
    })

    it('should parse and validate tag list with string.split()', () => {
      const tagsString = createRulesString('tech,javascript,firebase')
      const tags = tagsString.split(',')
      const allowedTags = ['tech', 'javascript', 'firebase', 'cloud', 'web']

      expect(tags).toHaveLength(3)
      expect(createRulesList(tags).hasAll(['tech', 'firebase'])).toBe(true)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle null-safe access patterns', () => {
      const path = createPath('/databases/(default)/documents/users/nonexistent')

      // Safe pattern: check exists before get
      if (!ctx.exists(path)) {
        expect(ctx.get(path)).toBeNull()
      }
    })

    it('should handle concurrent document reads', () => {
      const paths = [
        '/databases/(default)/documents/users/user1',
        '/databases/(default)/documents/users/user2',
        '/databases/(default)/documents/users/user3',
      ]

      paths.forEach((p, i) => {
        documentStore.set(p, {
          __name__: p,
          id: `user${i + 1}`,
          data: { index: i },
        })
      })

      // All documents should be accessible
      paths.forEach((p, i) => {
        const resource = ctx.get(createPath(p))
        expect(resource?.data.index).toBe(i)
      })
    })

    it('should handle special regex characters in string.matches()', () => {
      const str = createRulesString('hello.world')

      // Unescaped dot matches any character
      expect(str.matches('hello.world')).toBe(true)

      // Escaped dot matches literal dot
      expect(str.matches('hello\\.world')).toBe(true)
    })

    it('should handle unicode in string operations', () => {
      const str = createRulesString('Hello')
      expect(str.size()).toBe(5)

      const unicodeStr = createRulesString('\u4e2d\u6587')
      expect(unicodeStr.size()).toBe(2)
    })

    it('should handle maximum safe integer in math operations', () => {
      const maxSafe = Number.MAX_SAFE_INTEGER
      expect(ctx.math.abs(maxSafe)).toBe(maxSafe)
      expect(ctx.math.floor(maxSafe)).toBe(maxSafe)
    })

    it('should handle floating point precision in math operations', () => {
      // 0.1 + 0.2 !== 0.3 due to floating point
      const result = ctx.math.round((0.1 + 0.2) * 10) / 10
      expect(result).toBeCloseTo(0.3)
    })
  })
})
