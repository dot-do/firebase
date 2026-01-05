import { describe, it, expect } from 'vitest'

/**
 * Firebase Security Rules Path Matching Tests
 *
 * These tests verify that document paths are correctly matched against security
 * rules patterns. Firebase Security Rules use a specific path syntax with:
 * - Exact path segments: /users/alice
 * - Single-segment wildcards: /users/{userId}
 * - Recursive wildcards: /users/{path=**}
 * - Collection group patterns: {document=**}/reviews
 *
 * Reference: https://firebase.google.com/docs/firestore/security/rules-structure
 */

import { matchPath, matchCollectionGroup } from '../../src/rules/path-matcher'

describe('Firebase Security Rules Path Matching', () => {
  describe('Exact Path Matching', () => {
    it('should match identical paths exactly', () => {
      const result = matchPath('/users/alice', '/users/alice')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({})
    })

    it('should match root collection document', () => {
      const result = matchPath('/posts/post123', '/posts/post123')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({})
    })

    it('should NOT match different paths', () => {
      const result = matchPath('/users/alice', '/users/bob')

      expect(result.matches).toBe(false)
    })

    it('should NOT match paths with different segment counts', () => {
      const result = matchPath('/users/alice', '/users/alice/posts')

      expect(result.matches).toBe(false)
    })

    it('should NOT match paths with different collections', () => {
      const result = matchPath('/users/alice', '/posts/alice')

      expect(result.matches).toBe(false)
    })

    it('should be case-sensitive', () => {
      const result = matchPath('/users/Alice', '/users/alice')

      expect(result.matches).toBe(false)
    })
  })

  describe('Single-Segment Wildcard Matching', () => {
    it('should match any single segment with {wildcard}', () => {
      const result = matchPath('/users/{userId}', '/users/alice')

      expect(result.matches).toBe(true)
    })

    it('should match different values for the same pattern', () => {
      const pattern = '/users/{userId}'

      expect(matchPath(pattern, '/users/alice').matches).toBe(true)
      expect(matchPath(pattern, '/users/bob').matches).toBe(true)
      expect(matchPath(pattern, '/users/user-123').matches).toBe(true)
      expect(matchPath(pattern, '/users/abc_xyz').matches).toBe(true)
    })

    it('should NOT match multiple segments with single wildcard', () => {
      const result = matchPath('/users/{userId}', '/users/alice/posts')

      expect(result.matches).toBe(false)
    })

    it('should NOT match empty segment', () => {
      const result = matchPath('/users/{userId}', '/users/')

      expect(result.matches).toBe(false)
    })

    it('should match wildcards in collection position', () => {
      const result = matchPath('/{collection}/doc1', '/users/doc1')

      expect(result.matches).toBe(true)
    })

    it('should match multiple wildcards in pattern', () => {
      const result = matchPath('/{collection}/{docId}', '/users/alice')

      expect(result.matches).toBe(true)
    })
  })

  describe('Wildcard Value Extraction', () => {
    it('should extract userId from /users/{userId}', () => {
      const result = matchPath('/users/{userId}', '/users/alice')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({ userId: 'alice' })
    })

    it('should extract docId from /posts/{docId}', () => {
      const result = matchPath('/posts/{docId}', '/posts/post-abc-123')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({ docId: 'post-abc-123' })
    })

    it('should extract multiple wildcards', () => {
      const result = matchPath('/users/{userId}/posts/{postId}', '/users/alice/posts/post1')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({
        userId: 'alice',
        postId: 'post1'
      })
    })

    it('should extract wildcards with special characters in values', () => {
      const result = matchPath('/users/{userId}', '/users/user@example.com')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({ userId: 'user@example.com' })
    })

    it('should extract wildcards with URL-encoded values', () => {
      const result = matchPath('/files/{fileId}', '/files/file%20name.txt')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({ fileId: 'file%20name.txt' })
    })

    it('should return empty wildcards for exact matches', () => {
      const result = matchPath('/users/alice', '/users/alice')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({})
    })
  })

  describe('Nested Path Matching', () => {
    it('should match deeply nested paths with wildcards', () => {
      const result = matchPath(
        '/users/{userId}/posts/{postId}',
        '/users/alice/posts/post1'
      )

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({
        userId: 'alice',
        postId: 'post1'
      })
    })

    it('should match 3-level deep paths', () => {
      const result = matchPath(
        '/users/{userId}/posts/{postId}/comments/{commentId}',
        '/users/alice/posts/post1/comments/comment1'
      )

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({
        userId: 'alice',
        postId: 'post1',
        commentId: 'comment1'
      })
    })

    it('should match mixed exact and wildcard segments', () => {
      const result = matchPath(
        '/organizations/{orgId}/teams/engineering',
        '/organizations/acme/teams/engineering'
      )

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({ orgId: 'acme' })
    })

    it('should NOT match nested path with wrong intermediate collection', () => {
      const result = matchPath(
        '/users/{userId}/posts/{postId}',
        '/users/alice/comments/comment1'
      )

      expect(result.matches).toBe(false)
    })

    it('should NOT match shorter path to nested pattern', () => {
      const result = matchPath(
        '/users/{userId}/posts/{postId}',
        '/users/alice'
      )

      expect(result.matches).toBe(false)
    })

    it('should NOT match longer path to nested pattern', () => {
      const result = matchPath(
        '/users/{userId}/posts/{postId}',
        '/users/alice/posts/post1/extra'
      )

      expect(result.matches).toBe(false)
    })
  })

  describe('Recursive Wildcard Matching ({path=**})', () => {
    it('should match single segment under recursive wildcard', () => {
      const result = matchPath('/users/{path=**}', '/users/alice')

      expect(result.matches).toBe(true)
    })

    it('should match multiple segments under recursive wildcard', () => {
      const result = matchPath('/users/{path=**}', '/users/alice/posts/post1')

      expect(result.matches).toBe(true)
    })

    it('should match deeply nested paths under recursive wildcard', () => {
      const result = matchPath(
        '/data/{path=**}',
        '/data/level1/level2/level3/level4/doc'
      )

      expect(result.matches).toBe(true)
    })

    it('should extract full path as wildcard value', () => {
      const result = matchPath('/users/{path=**}', '/users/alice/posts/post1')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({ path: 'alice/posts/post1' })
    })

    it('should extract single segment for recursive wildcard', () => {
      const result = matchPath('/users/{path=**}', '/users/alice')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({ path: 'alice' })
    })

    it('should work with prefix before recursive wildcard', () => {
      const result = matchPath(
        '/organizations/{orgId}/data/{rest=**}',
        '/organizations/acme/data/projects/proj1/tasks/task1'
      )

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({
        orgId: 'acme',
        rest: 'projects/proj1/tasks/task1'
      })
    })

    it('should NOT match if prefix does not match', () => {
      const result = matchPath('/users/{path=**}', '/posts/post1')

      expect(result.matches).toBe(false)
    })

    it('should NOT match empty path after prefix', () => {
      // The recursive wildcard must match at least one segment
      const result = matchPath('/users/{path=**}', '/users')

      expect(result.matches).toBe(false)
    })

    it('should differentiate between single and recursive wildcards', () => {
      const singleResult = matchPath('/users/{userId}', '/users/alice/posts')
      const recursiveResult = matchPath('/users/{path=**}', '/users/alice/posts')

      expect(singleResult.matches).toBe(false)
      expect(recursiveResult.matches).toBe(true)
    })
  })

  describe('No Match Cases', () => {
    it('should NOT match when collection name differs', () => {
      const result = matchPath('/users/{userId}', '/posts/alice')

      expect(result.matches).toBe(false)
    })

    it('should NOT match when path is shorter than pattern', () => {
      const result = matchPath('/users/{userId}/settings', '/users/alice')

      expect(result.matches).toBe(false)
    })

    it('should NOT match when path is longer than pattern (non-recursive)', () => {
      const result = matchPath('/users/{userId}', '/users/alice/extra/segments')

      expect(result.matches).toBe(false)
    })

    it('should NOT match completely unrelated paths', () => {
      const result = matchPath('/products/{productId}', '/orders/order123')

      expect(result.matches).toBe(false)
    })

    it('should NOT match empty path', () => {
      const result = matchPath('/users/{userId}', '')

      expect(result.matches).toBe(false)
    })

    it('should NOT match root path to document pattern', () => {
      const result = matchPath('/users/{userId}', '/')

      expect(result.matches).toBe(false)
    })

    it('should handle patterns with trailing slashes consistently', () => {
      // Both should behave the same
      const result1 = matchPath('/users/{userId}', '/users/alice')
      const result2 = matchPath('/users/{userId}/', '/users/alice')

      expect(result1.matches).toBe(result2.matches)
    })
  })

  describe('Collection Group Queries', () => {
    it('should match reviews subcollection at any depth', () => {
      const result = matchCollectionGroup('reviews', '/products/prod1/reviews/review1')

      expect(result.matches).toBe(true)
    })

    it('should match deeply nested reviews subcollection', () => {
      const result = matchCollectionGroup(
        'reviews',
        '/users/alice/purchases/order1/items/item1/reviews/review1'
      )

      expect(result.matches).toBe(true)
    })

    it('should match reviews directly under root', () => {
      const result = matchCollectionGroup('reviews', '/reviews/review1')

      expect(result.matches).toBe(true)
    })

    it('should NOT match if collection name does not match', () => {
      const result = matchCollectionGroup('reviews', '/products/prod1/comments/comment1')

      expect(result.matches).toBe(false)
    })

    it('should NOT match if path does not end with collection/document', () => {
      const result = matchCollectionGroup('reviews', '/products/prod1/reviews')

      expect(result.matches).toBe(false)
    })

    it('should extract parent path in wildcards', () => {
      const result = matchCollectionGroup('reviews', '/products/prod1/reviews/review1')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toHaveProperty('document')
      expect(result.wildcards.document).toBe('review1')
    })

    it('should match multiple different collection groups', () => {
      const path1 = '/users/alice/reviews/review1'
      const path2 = '/products/prod1/reviews/review1'
      const path3 = '/orders/order1/items/item1/reviews/review1'

      expect(matchCollectionGroup('reviews', path1).matches).toBe(true)
      expect(matchCollectionGroup('reviews', path2).matches).toBe(true)
      expect(matchCollectionGroup('reviews', path3).matches).toBe(true)
    })

    it('should be case-sensitive for collection names', () => {
      const result = matchCollectionGroup('Reviews', '/products/prod1/reviews/review1')

      expect(result.matches).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle paths with special characters in segment values', () => {
      const result = matchPath('/users/{userId}', '/users/user-name_123')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({ userId: 'user-name_123' })
    })

    it('should handle paths with dots in segment values', () => {
      const result = matchPath('/files/{fileId}', '/files/document.pdf')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({ fileId: 'document.pdf' })
    })

    it('should handle numeric-looking segment values', () => {
      const result = matchPath('/items/{itemId}', '/items/12345')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({ itemId: '12345' })
    })

    it('should handle UUID-style segment values', () => {
      const result = matchPath('/entities/{entityId}', '/entities/550e8400-e29b-41d4-a716-446655440000')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({ entityId: '550e8400-e29b-41d4-a716-446655440000' })
    })

    it('should handle very long paths', () => {
      const result = matchPath(
        '/a/{b}/c/{d}/e/{f}/g/{h}',
        '/a/1/c/2/e/3/g/4'
      )

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({
        b: '1',
        d: '2',
        f: '3',
        h: '4'
      })
    })

    it('should handle empty string wildcard names gracefully', () => {
      // This is an invalid pattern but should not crash
      expect(() => matchPath('/users/{}', '/users/alice')).not.toThrow()
    })

    it('should handle patterns with multiple consecutive slashes', () => {
      // Should normalize and handle gracefully
      const result = matchPath('/users//alice', '/users/alice')

      // Either normalize to match or explicitly not match
      expect(typeof result.matches).toBe('boolean')
    })

    it('should handle paths starting without leading slash', () => {
      const result = matchPath('users/{userId}', 'users/alice')

      expect(result.matches).toBe(true)
      expect(result.wildcards).toEqual({ userId: 'alice' })
    })
  })

  describe('Pattern Validation', () => {
    it('should handle duplicate wildcard names in pattern', () => {
      // Pattern has same wildcard name twice - should this be an error?
      // Testing current behavior
      const result = matchPath('/users/{id}/posts/{id}', '/users/alice/posts/post1')

      // Behavior may vary: last value wins, first value wins, or error
      expect(result.matches).toBe(true)
      // The implementation should define which value is used
      expect(result.wildcards).toHaveProperty('id')
    })

    it('should handle wildcard with whitespace in name', () => {
      // Edge case: wildcard name has spaces
      expect(() => matchPath('/users/{ userId }', '/users/alice')).not.toThrow()
    })

    it('should handle nested curly braces', () => {
      // Malformed pattern
      expect(() => matchPath('/users/{{userId}}', '/users/alice')).not.toThrow()
    })

    it('should handle unclosed curly brace', () => {
      // Malformed pattern
      expect(() => matchPath('/users/{userId', '/users/alice')).not.toThrow()
    })

    it('should handle unopened curly brace', () => {
      // Malformed pattern
      expect(() => matchPath('/users/userId}', '/users/alice')).not.toThrow()
    })
  })
})
