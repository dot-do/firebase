import { describe, it, expect, beforeEach } from 'vitest'
import {
  createEvaluator,
  type AuthContext,
  type RequestContext,
  type ResourceContext,
  type EvaluatorContext,
  type RulesEvaluator,
} from '../../src/rules/evaluator'

/**
 * Tests for Firestore Security Rules Expression Evaluator
 *
 * These tests verify that the rules evaluator correctly handles:
 * - request.auth context (uid, token claims)
 * - request.resource.data (incoming document data)
 * - resource.data (existing document data)
 * - Document fetching with get()
 * - Existence checks with exists()
 * - Logical operators (&&, ||, !)
 * - Comparison operators (==, !=, <, >, <=, >=)
 * - String methods (.matches(), .size())
 * - List methods (.hasAny(), .hasAll(), .size())
 */

describe('Firestore Security Rules Expression Evaluator', () => {
  let evaluator: RulesEvaluator

  beforeEach(() => {
    evaluator = createEvaluator()
  })

  describe('request.auth - Auth Context', () => {
    it('should return null when user is not authenticated', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      const result = evaluator.evaluate('request.auth', context)
      expect(result).toBeNull()
    })

    it('should return auth context with uid when authenticated', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      const result = evaluator.evaluate('request.auth.uid', context)
      expect(result).toBe('user123')
    })

    it('should access token claims', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {
              email: 'user@example.com',
              email_verified: true,
              admin: true,
              role: 'moderator',
            },
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      expect(evaluator.evaluate('request.auth.token.email', context)).toBe('user@example.com')
      expect(evaluator.evaluate('request.auth.token.email_verified', context)).toBe(true)
      expect(evaluator.evaluate('request.auth.token.admin', context)).toBe(true)
      expect(evaluator.evaluate('request.auth.token.role', context)).toBe('moderator')
    })

    it('should return null for missing token claims', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      const result = evaluator.evaluate('request.auth.token.nonexistent', context)
      expect(result).toBeNull()
    })
  })

  describe('request.auth.uid == resource.data.ownerId - Comparison', () => {
    it('should return true when uid matches ownerId', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { ownerId: 'user123', title: 'My Post' },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      const result = evaluator.evaluate('request.auth.uid == resource.data.ownerId', context)
      expect(result).toBe(true)
    })

    it('should return false when uid does not match ownerId', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { ownerId: 'otherUser', title: 'My Post' },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      const result = evaluator.evaluate('request.auth.uid == resource.data.ownerId', context)
      expect(result).toBe(false)
    })

    it('should handle null auth in comparison', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { ownerId: 'user123' },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      const result = evaluator.evaluate('request.auth.uid == resource.data.ownerId', context)
      expect(result).toBe(false)
    })
  })

  describe('request.resource.data - Incoming Document Data', () => {
    it('should access incoming document data on create', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: {
            data: {
              title: 'New Post',
              content: 'Hello World',
              tags: ['tech', 'news'],
            },
          },
          method: 'create',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      expect(evaluator.evaluate('request.resource.data.title', context)).toBe('New Post')
      expect(evaluator.evaluate('request.resource.data.content', context)).toBe('Hello World')
      expect(evaluator.evaluate('request.resource.data.tags', context)).toEqual(['tech', 'news'])
    })

    it('should access incoming document data on update', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: {
            data: {
              title: 'Updated Post',
              content: 'Updated Content',
            },
          },
          method: 'update',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: {
            title: 'Original Post',
            content: 'Original Content',
            ownerId: 'user123',
          },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      expect(evaluator.evaluate('request.resource.data.title', context)).toBe('Updated Post')
      expect(evaluator.evaluate('resource.data.title', context)).toBe('Original Post')
    })

    it('should validate incoming data does not change certain fields', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: {
            data: {
              title: 'Updated Post',
              ownerId: 'user123',
            },
          },
          method: 'update',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: {
            title: 'Original Post',
            ownerId: 'user123',
          },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      const result = evaluator.evaluate(
        'request.resource.data.ownerId == resource.data.ownerId',
        context
      )
      expect(result).toBe(true)
    })
  })

  describe('resource.data - Existing Document Data', () => {
    it('should access existing document data', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: {
            title: 'Existing Post',
            content: 'Some content',
            views: 100,
            published: true,
          },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      expect(evaluator.evaluate('resource.data.title', context)).toBe('Existing Post')
      expect(evaluator.evaluate('resource.data.views', context)).toBe(100)
      expect(evaluator.evaluate('resource.data.published', context)).toBe(true)
    })

    it('should return null when resource does not exist', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'create',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      const result = evaluator.evaluate('resource.data', context)
      expect(result).toBeNull()
    })

    it('should handle nested data fields', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: {
            metadata: {
              createdAt: '2024-01-01',
              updatedAt: '2024-01-02',
              author: {
                name: 'John Doe',
                email: 'john@example.com',
              },
            },
          },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      expect(evaluator.evaluate('resource.data.metadata.author.name', context)).toBe('John Doe')
      expect(evaluator.evaluate('resource.data.metadata.createdAt', context)).toBe('2024-01-01')
    })
  })

  describe('get() - Document Fetching', () => {
    it('should fetch a document by path', () => {
      const result = evaluator.get('/databases/default/documents/users/user123')
      expect(result).not.toBeNull()
      expect(result?.data).toBeDefined()
    })

    it('should return null for non-existent document', () => {
      const result = evaluator.get('/databases/default/documents/users/nonexistent')
      expect(result).toBeNull()
    })

    it('should evaluate get() in expression with variable interpolation', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      // Expression: get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
      const result = evaluator.evaluate(
        "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'",
        context
      )
      expect(result).toBeDefined()
    })

    it('should handle get() returning document with specific fields', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'create',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      // Check if user document has required fields
      const result = evaluator.evaluate(
        'get(/databases/$(database)/documents/users/$(request.auth.uid)).data.verified == true',
        context
      )
      expect(typeof result).toBe('boolean')
    })
  })

  describe('exists() - Existence Check', () => {
    it('should return true for existing document', () => {
      const result = evaluator.exists('/databases/default/documents/users/user123')
      expect(result).toBe(true)
    })

    it('should return false for non-existent document', () => {
      const result = evaluator.exists('/databases/default/documents/users/nonexistent')
      expect(result).toBe(false)
    })

    it('should evaluate exists() in expression', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'create',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      const result = evaluator.evaluate(
        'exists(/databases/$(database)/documents/users/$(request.auth.uid))',
        context
      )
      expect(typeof result).toBe('boolean')
    })

    it('should use exists() to check for duplicate prevention', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: {
            data: {
              slug: 'my-unique-post',
            },
          },
          method: 'create',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      // Check that a post with the same slug doesn't exist
      const result = evaluator.evaluate(
        '!exists(/databases/$(database)/documents/posts_by_slug/$(request.resource.data.slug))',
        context
      )
      expect(typeof result).toBe('boolean')
    })
  })

  describe('Logical Operators: &&, ||, !', () => {
    it('should evaluate && (AND) operator', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: { admin: true },
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { published: true },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      // Both conditions true
      const result1 = evaluator.evaluate(
        'request.auth != null && resource.data.published == true',
        context
      )
      expect(result1).toBe(true)

      // One condition false
      const context2 = { ...context, resource: { ...context.resource!, data: { published: false } } }
      const result2 = evaluator.evaluate(
        'request.auth != null && resource.data.published == true',
        context2
      )
      expect(result2).toBe(false)
    })

    it('should evaluate || (OR) operator', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: { admin: false },
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { ownerId: 'user123', published: false },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      // First condition true
      const result1 = evaluator.evaluate(
        'request.auth.uid == resource.data.ownerId || request.auth.token.admin == true',
        context
      )
      expect(result1).toBe(true)

      // Second condition true
      const context2: EvaluatorContext = {
        ...context,
        request: {
          ...context.request,
          auth: { uid: 'otherUser', token: { admin: true } },
        },
      }
      const result2 = evaluator.evaluate(
        'request.auth.uid == resource.data.ownerId || request.auth.token.admin == true',
        context2
      )
      expect(result2).toBe(true)

      // Both conditions false
      const context3: EvaluatorContext = {
        ...context,
        request: {
          ...context.request,
          auth: { uid: 'otherUser', token: { admin: false } },
        },
      }
      const result3 = evaluator.evaluate(
        'request.auth.uid == resource.data.ownerId || request.auth.token.admin == true',
        context3
      )
      expect(result3).toBe(false)
    })

    it('should evaluate ! (NOT) operator', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { deleted: false },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      const result1 = evaluator.evaluate('!resource.data.deleted', context)
      expect(result1).toBe(true)

      const context2 = { ...context, resource: { ...context.resource!, data: { deleted: true } } }
      const result2 = evaluator.evaluate('!resource.data.deleted', context2)
      expect(result2).toBe(false)
    })

    it('should evaluate complex nested logical expressions', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: { admin: true, verified: true },
          },
          resource: { data: {} },
          method: 'update',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { ownerId: 'user123', published: true, locked: false },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      // Complex expression: (isOwner || isAdmin) && !isLocked && isVerified
      const result = evaluator.evaluate(
        '(request.auth.uid == resource.data.ownerId || request.auth.token.admin == true) && !resource.data.locked && request.auth.token.verified == true',
        context
      )
      expect(result).toBe(true)
    })
  })

  describe('Comparison Operators: ==, !=, <, >, <=, >=', () => {
    it('should evaluate == (equality) operator', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { status: 'published', count: 10 },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      expect(evaluator.evaluate("resource.data.status == 'published'", context)).toBe(true)
      expect(evaluator.evaluate("resource.data.status == 'draft'", context)).toBe(false)
      expect(evaluator.evaluate('resource.data.count == 10', context)).toBe(true)
    })

    it('should evaluate != (inequality) operator', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { status: 'published' },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      expect(evaluator.evaluate("resource.data.status != 'draft'", context)).toBe(true)
      expect(evaluator.evaluate("resource.data.status != 'published'", context)).toBe(false)
    })

    it('should evaluate < (less than) operator', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { price: 50, quantity: 5 },
          id: '123',
          __name__: 'products/123',
        },
        database: 'default',
      }

      expect(evaluator.evaluate('resource.data.price < 100', context)).toBe(true)
      expect(evaluator.evaluate('resource.data.price < 50', context)).toBe(false)
      expect(evaluator.evaluate('resource.data.price < 25', context)).toBe(false)
    })

    it('should evaluate > (greater than) operator', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { rating: 4.5, reviews: 100 },
          id: '123',
          __name__: 'products/123',
        },
        database: 'default',
      }

      expect(evaluator.evaluate('resource.data.rating > 4.0', context)).toBe(true)
      expect(evaluator.evaluate('resource.data.reviews > 50', context)).toBe(true)
      expect(evaluator.evaluate('resource.data.rating > 5.0', context)).toBe(false)
    })

    it('should evaluate <= (less than or equal) operator', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { age: 18 },
          id: '123',
          __name__: 'users/123',
        },
        database: 'default',
      }

      expect(evaluator.evaluate('resource.data.age <= 18', context)).toBe(true)
      expect(evaluator.evaluate('resource.data.age <= 21', context)).toBe(true)
      expect(evaluator.evaluate('resource.data.age <= 17', context)).toBe(false)
    })

    it('should evaluate >= (greater than or equal) operator', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { level: 5 },
          id: '123',
          __name__: 'users/123',
        },
        database: 'default',
      }

      expect(evaluator.evaluate('resource.data.level >= 5', context)).toBe(true)
      expect(evaluator.evaluate('resource.data.level >= 3', context)).toBe(true)
      expect(evaluator.evaluate('resource.data.level >= 10', context)).toBe(false)
    })

    it('should compare different types correctly', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/test/123',
          time: new Date(),
        },
        resource: {
          data: {
            stringVal: 'hello',
            numVal: 42,
            boolVal: true,
            nullVal: null,
          },
          id: '123',
          __name__: 'test/123',
        },
        database: 'default',
      }

      // String comparison
      expect(evaluator.evaluate("resource.data.stringVal == 'hello'", context)).toBe(true)
      // Number comparison
      expect(evaluator.evaluate('resource.data.numVal == 42', context)).toBe(true)
      // Boolean comparison
      expect(evaluator.evaluate('resource.data.boolVal == true', context)).toBe(true)
      // Null comparison
      expect(evaluator.evaluate('resource.data.nullVal == null', context)).toBe(true)
      // Type mismatch should return false
      expect(evaluator.evaluate("resource.data.numVal == '42'", context)).toBe(false)
    })
  })

  describe('String Methods: .matches(), .size()', () => {
    it('should evaluate .matches() for regex patterns', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: { email: 'user@example.com' },
          },
          resource: {
            data: {
              email: 'test@company.com',
              phone: '+1-555-123-4567',
            },
          },
          method: 'create',
          path: '/databases/default/documents/users/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      // Email pattern
      expect(
        evaluator.evaluate(
          "request.resource.data.email.matches('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,}$')",
          context
        )
      ).toBe(true)

      // Phone pattern
      expect(
        evaluator.evaluate(
          "request.resource.data.phone.matches('^\\\\+[0-9-]+$')",
          context
        )
      ).toBe(true)
    })

    it('should return false for non-matching patterns', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: {
            data: {
              email: 'invalid-email',
              slug: 'invalid slug with spaces',
            },
          },
          method: 'create',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      expect(
        evaluator.evaluate(
          "request.resource.data.email.matches('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,}$')",
          context
        )
      ).toBe(false)

      // Slug should only contain lowercase letters, numbers, and hyphens
      expect(
        evaluator.evaluate(
          "request.resource.data.slug.matches('^[a-z0-9-]+$')",
          context
        )
      ).toBe(false)
    })

    it('should evaluate .size() for string length', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: {
            data: {
              title: 'Hello World',
              description: 'A',
              content: 'x'.repeat(1000),
            },
          },
          method: 'create',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      // Title length check
      expect(evaluator.evaluate('request.resource.data.title.size() == 11', context)).toBe(true)
      expect(evaluator.evaluate('request.resource.data.title.size() > 5', context)).toBe(true)
      expect(evaluator.evaluate('request.resource.data.title.size() < 100', context)).toBe(true)

      // Minimum length validation
      expect(evaluator.evaluate('request.resource.data.description.size() >= 1', context)).toBe(true)
      expect(evaluator.evaluate('request.resource.data.description.size() >= 10', context)).toBe(false)

      // Maximum length validation
      expect(evaluator.evaluate('request.resource.data.content.size() <= 10000', context)).toBe(true)
      expect(evaluator.evaluate('request.resource.data.content.size() <= 500', context)).toBe(false)
    })

    it('should combine .matches() and .size() validations', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: {
            data: {
              username: 'john_doe',
            },
          },
          method: 'create',
          path: '/databases/default/documents/users/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      // Username must be 3-20 characters and contain only alphanumeric and underscores
      const result = evaluator.evaluate(
        "request.resource.data.username.size() >= 3 && request.resource.data.username.size() <= 20 && request.resource.data.username.matches('^[a-zA-Z0-9_]+$')",
        context
      )
      expect(result).toBe(true)
    })
  })

  describe('List Methods: .hasAny(), .hasAll(), .size()', () => {
    it('should evaluate .hasAny() for partial list matching', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {
              roles: ['editor', 'viewer'],
            },
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: {
            tags: ['tech', 'news', 'featured'],
            allowedUsers: ['user123', 'user456'],
          },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      // Check if user has any of the required roles
      expect(
        evaluator.evaluate(
          "request.auth.token.roles.hasAny(['admin', 'editor'])",
          context
        )
      ).toBe(true)

      expect(
        evaluator.evaluate(
          "request.auth.token.roles.hasAny(['admin', 'superuser'])",
          context
        )
      ).toBe(false)

      // Check if document has any of the specified tags
      expect(
        evaluator.evaluate(
          "resource.data.tags.hasAny(['featured', 'trending'])",
          context
        )
      ).toBe(true)
    })

    it('should evaluate .hasAll() for complete list matching', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {
              permissions: ['read', 'write', 'delete'],
            },
          },
          resource: { data: {} },
          method: 'delete',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: {
            requiredApprovals: ['legal', 'finance', 'hr'],
            approvals: ['legal', 'finance', 'hr', 'ceo'],
          },
          id: '123',
          __name__: 'contracts/123',
        },
        database: 'default',
      }

      // Check if user has all required permissions
      expect(
        evaluator.evaluate(
          "request.auth.token.permissions.hasAll(['read', 'write'])",
          context
        )
      ).toBe(true)

      expect(
        evaluator.evaluate(
          "request.auth.token.permissions.hasAll(['read', 'write', 'admin'])",
          context
        )
      ).toBe(false)

      // Check if document has all required approvals
      expect(
        evaluator.evaluate(
          "resource.data.approvals.hasAll(resource.data.requiredApprovals)",
          context
        )
      ).toBe(true)
    })

    it('should evaluate .size() for list length', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: {
            data: {
              tags: ['a', 'b', 'c'],
              images: ['img1.jpg', 'img2.jpg'],
              emptyList: [],
            },
          },
          method: 'create',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      // Exact size
      expect(evaluator.evaluate('request.resource.data.tags.size() == 3', context)).toBe(true)
      expect(evaluator.evaluate('request.resource.data.images.size() == 2', context)).toBe(true)
      expect(evaluator.evaluate('request.resource.data.emptyList.size() == 0', context)).toBe(true)

      // Size constraints
      expect(evaluator.evaluate('request.resource.data.tags.size() <= 10', context)).toBe(true)
      expect(evaluator.evaluate('request.resource.data.tags.size() >= 1', context)).toBe(true)
      expect(evaluator.evaluate('request.resource.data.images.size() > 0', context)).toBe(true)
    })

    it('should handle empty lists correctly', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {
              roles: [],
            },
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: {
            tags: [],
          },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      // hasAny with empty list should return false
      expect(
        evaluator.evaluate(
          "request.auth.token.roles.hasAny(['admin'])",
          context
        )
      ).toBe(false)

      // hasAll with empty required list should return true
      expect(
        evaluator.evaluate(
          'resource.data.tags.hasAll([])',
          context
        )
      ).toBe(true)

      // size of empty list
      expect(evaluator.evaluate('resource.data.tags.size() == 0', context)).toBe(true)
    })

    it('should combine list methods with other operations', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {
              roles: ['moderator'],
            },
          },
          resource: {
            data: {
              tags: ['news', 'politics'],
            },
          },
          method: 'create',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      // User is moderator AND post is about news
      const result = evaluator.evaluate(
        "request.auth.token.roles.hasAny(['admin', 'moderator']) && request.resource.data.tags.hasAny(['news'])",
        context
      )
      expect(result).toBe(true)

      // Validate tag count is within limits
      const sizeCheck = evaluator.evaluate(
        'request.resource.data.tags.size() >= 1 && request.resource.data.tags.size() <= 5',
        context
      )
      expect(sizeCheck).toBe(true)
    })
  })

  describe('Complex Real-World Expressions', () => {
    it('should evaluate owner or admin can edit expression', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: { admin: false },
          },
          resource: {
            data: {
              title: 'Updated Title',
              ownerId: 'user123',
            },
          },
          method: 'update',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: {
            title: 'Original Title',
            ownerId: 'user123',
          },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      // Owner can edit their own posts, or admin can edit any post
      const result = evaluator.evaluate(
        'request.auth != null && (request.auth.uid == resource.data.ownerId || request.auth.token.admin == true)',
        context
      )
      expect(result).toBe(true)
    })

    it('should evaluate public read with auth write expression', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: {
            published: true,
            title: 'Public Post',
          },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      // Anyone can read published posts
      const readResult = evaluator.evaluate(
        'resource.data.published == true',
        context
      )
      expect(readResult).toBe(true)
    })

    it('should evaluate field validation expression', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: {
            data: {
              title: 'Valid Title',
              content: 'This is the content of the post.',
              tags: ['tech', 'programming'],
              ownerId: 'user123',
            },
          },
          method: 'create',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      // Validate all required fields
      const result = evaluator.evaluate(
        "request.resource.data.title.size() > 0 && request.resource.data.title.size() <= 100 && request.resource.data.content.size() > 0 && request.resource.data.tags.size() <= 10 && request.resource.data.ownerId == request.auth.uid",
        context
      )
      expect(result).toBe(true)
    })

    it('should evaluate rate limiting expression using document fetch', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: {
            data: {
              content: 'New comment',
            },
          },
          method: 'create',
          path: '/databases/default/documents/comments/456',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      // Check user's rate limit document
      const result = evaluator.evaluate(
        'get(/databases/$(database)/documents/rate_limits/$(request.auth.uid)).data.commentCount < 100',
        context
      )
      expect(typeof result).toBe('boolean')
    })

    it('should evaluate hierarchical permissions expression', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/organizations/org1/projects/proj1/tasks/task1',
          time: new Date(),
        },
        resource: {
          data: {
            title: 'Task 1',
            assignee: 'user456',
          },
          id: 'task1',
          __name__: 'organizations/org1/projects/proj1/tasks/task1',
        },
        database: 'default',
      }

      // Check if user is member of the organization
      const result = evaluator.evaluate(
        'exists(/databases/$(database)/documents/organizations/org1/members/$(request.auth.uid))',
        context
      )
      expect(typeof result).toBe('boolean')
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle null-safe navigation', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      // Accessing auth.uid when auth is null should not throw
      expect(() => evaluator.evaluate('request.auth.uid', context)).not.toThrow()
    })

    it('should handle missing fields gracefully', () => {
      const context: EvaluatorContext = {
        request: {
          auth: {
            uid: 'user123',
            token: {},
          },
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: { title: 'Test' },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      // Accessing non-existent field should return null
      const result = evaluator.evaluate('resource.data.nonExistentField', context)
      expect(result).toBeNull()
    })

    it('should handle type coercion correctly', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: {
            count: 0,
            emptyString: '',
            falseBool: false,
          },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      // 0 should not be treated as false in comparison
      expect(evaluator.evaluate('resource.data.count == 0', context)).toBe(true)
      expect(evaluator.evaluate('resource.data.count == false', context)).toBe(false)

      // Empty string should not be treated as false
      expect(evaluator.evaluate("resource.data.emptyString == ''", context)).toBe(true)
      expect(evaluator.evaluate('resource.data.emptyString == false', context)).toBe(false)
    })

    it('should handle deeply nested paths', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: {
            level1: {
              level2: {
                level3: {
                  level4: {
                    value: 'deep',
                  },
                },
              },
            },
          },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      const result = evaluator.evaluate(
        "resource.data.level1.level2.level3.level4.value == 'deep'",
        context
      )
      expect(result).toBe(true)
    })

    it('should handle special characters in string comparisons', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: {
            data: {
              title: "Hello 'World'",
              content: 'Line1\nLine2',
              path: '/path/to/file',
            },
          },
          method: 'create',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: null,
        database: 'default',
      }

      expect(
        evaluator.evaluate("request.resource.data.title == \"Hello 'World'\"", context)
      ).toBe(true)
      expect(
        evaluator.evaluate("request.resource.data.path == '/path/to/file'", context)
      ).toBe(true)
    })

    it('should handle array index access', () => {
      const context: EvaluatorContext = {
        request: {
          auth: null,
          resource: { data: {} },
          method: 'get',
          path: '/databases/default/documents/posts/123',
          time: new Date(),
        },
        resource: {
          data: {
            items: ['first', 'second', 'third'],
          },
          id: '123',
          __name__: 'posts/123',
        },
        database: 'default',
      }

      expect(evaluator.evaluate("resource.data.items[0] == 'first'", context)).toBe(true)
      expect(evaluator.evaluate("resource.data.items[2] == 'third'", context)).toBe(true)
    })
  })
})
