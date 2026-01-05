import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Firestore StructuredQuery to mongo.do Query Translation Tests
 *
 * These tests verify that Firestore StructuredQuery format is correctly translated
 * to MongoDB-compatible queries that can be used with mongo.do backend.
 *
 * Reference: https://cloud.google.com/firestore/docs/reference/rest/v1/StructuredQuery
 */

// =============================================================================
// Type Definitions - Firestore StructuredQuery Types
// =============================================================================

type FieldFilterOp =
  | 'OPERATOR_UNSPECIFIED'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'EQUAL'
  | 'NOT_EQUAL'
  | 'ARRAY_CONTAINS'
  | 'IN'
  | 'ARRAY_CONTAINS_ANY'
  | 'NOT_IN'

type CompositeFilterOp = 'OPERATOR_UNSPECIFIED' | 'AND' | 'OR'

type UnaryFilterOp = 'OPERATOR_UNSPECIFIED' | 'IS_NAN' | 'IS_NULL' | 'IS_NOT_NAN' | 'IS_NOT_NULL'

type OrderDirection = 'DIRECTION_UNSPECIFIED' | 'ASCENDING' | 'DESCENDING'

interface FieldReference {
  fieldPath: string
}

interface FirestoreValue {
  nullValue?: 'NULL_VALUE'
  booleanValue?: boolean
  integerValue?: string | number
  doubleValue?: string | number
  timestampValue?: string | { seconds?: string | number; nanos?: number }
  stringValue?: string
  bytesValue?: string | Uint8Array
  referenceValue?: string
  geoPointValue?: { latitude?: number; longitude?: number }
  arrayValue?: { values?: FirestoreValue[] }
  mapValue?: { fields?: Record<string, FirestoreValue> }
}

interface FieldFilter {
  field: FieldReference
  op: FieldFilterOp
  value: FirestoreValue
}

interface UnaryFilter {
  op: UnaryFilterOp
  field: FieldReference
}

interface CompositeFilter {
  op: CompositeFilterOp
  filters: Filter[]
}

interface Filter {
  compositeFilter?: CompositeFilter
  fieldFilter?: FieldFilter
  unaryFilter?: UnaryFilter
}

interface Order {
  field: FieldReference
  direction?: OrderDirection
}

interface Cursor {
  values: FirestoreValue[]
  before?: boolean
}

interface CollectionSelector {
  collectionId: string
  allDescendants?: boolean
}

interface Projection {
  fields?: FieldReference[]
}

interface StructuredQuery {
  select?: Projection
  from?: CollectionSelector[]
  where?: Filter
  orderBy?: Order[]
  startAt?: Cursor
  endAt?: Cursor
  offset?: number
  limit?: number | { value: number }
}

// =============================================================================
// Type Definitions - MongoDB Query Types (mongo.do compatible)
// =============================================================================

interface MongoQuery {
  collection: string
  filter?: Record<string, unknown>
  sort?: Record<string, 1 | -1>
  limit?: number
  skip?: number
  projection?: Record<string, 1 | 0>
}

// =============================================================================
// Import the actual implementation
// =============================================================================

import { translateStructuredQuery } from '../../src/firestore/query'

// =============================================================================
// Tests
// =============================================================================

describe('Firestore StructuredQuery to mongo.do Query Translation', () => {
  describe('Collection Selection (from)', () => {
    it('should translate simple collection selector', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }]
      }

      const result = translateStructuredQuery(query)

      expect(result.collection).toBe('users')
    })

    it('should handle collection selector with allDescendants flag', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'posts', allDescendants: true }]
      }

      const result = translateStructuredQuery(query)

      expect(result.collection).toBe('posts')
      // allDescendants should be handled appropriately (may need special handling)
    })
  })

  describe('where() Filters - EQUAL', () => {
    it('should translate EQUAL filter with string value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'name' },
            op: 'EQUAL',
            value: { stringValue: 'John' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ name: { $eq: 'John' } })
    })

    it('should translate EQUAL filter with integer value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'age' },
            op: 'EQUAL',
            value: { integerValue: '25' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ age: { $eq: 25 } })
    })

    it('should translate EQUAL filter with boolean value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'active' },
            op: 'EQUAL',
            value: { booleanValue: true }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ active: { $eq: true } })
    })

    it('should translate EQUAL filter with double value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'products' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'price' },
            op: 'EQUAL',
            value: { doubleValue: 19.99 }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ price: { $eq: 19.99 } })
    })

    it('should translate EQUAL filter with null value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'deletedAt' },
            op: 'EQUAL',
            value: { nullValue: 'NULL_VALUE' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ deletedAt: { $eq: null } })
    })
  })

  describe('where() Filters - NOT_EQUAL', () => {
    it('should translate NOT_EQUAL filter with string value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'NOT_EQUAL',
            value: { stringValue: 'deleted' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ status: { $ne: 'deleted' } })
    })

    it('should translate NOT_EQUAL filter with integer value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'role' },
            op: 'NOT_EQUAL',
            value: { integerValue: 0 }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ role: { $ne: 0 } })
    })
  })

  describe('where() Filters - LESS_THAN', () => {
    it('should translate LESS_THAN filter with integer value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'age' },
            op: 'LESS_THAN',
            value: { integerValue: '18' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ age: { $lt: 18 } })
    })

    it('should translate LESS_THAN filter with double value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'products' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'price' },
            op: 'LESS_THAN',
            value: { doubleValue: 100.0 }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ price: { $lt: 100.0 } })
    })

    it('should translate LESS_THAN filter with timestamp value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'events' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'createdAt' },
            op: 'LESS_THAN',
            value: { timestampValue: '2024-01-01T00:00:00Z' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter?.createdAt).toHaveProperty('$lt')
      // The translated value should be a Date object or equivalent
    })
  })

  describe('where() Filters - LESS_THAN_OR_EQUAL', () => {
    it('should translate LESS_THAN_OR_EQUAL filter', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'age' },
            op: 'LESS_THAN_OR_EQUAL',
            value: { integerValue: '65' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ age: { $lte: 65 } })
    })
  })

  describe('where() Filters - GREATER_THAN', () => {
    it('should translate GREATER_THAN filter with integer value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'age' },
            op: 'GREATER_THAN',
            value: { integerValue: '18' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ age: { $gt: 18 } })
    })

    it('should translate GREATER_THAN filter with double value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'total' },
            op: 'GREATER_THAN',
            value: { doubleValue: 50.0 }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ total: { $gt: 50.0 } })
    })
  })

  describe('where() Filters - GREATER_THAN_OR_EQUAL', () => {
    it('should translate GREATER_THAN_OR_EQUAL filter', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'products' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'stock' },
            op: 'GREATER_THAN_OR_EQUAL',
            value: { integerValue: '10' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ stock: { $gte: 10 } })
    })
  })

  describe('where() Filters - IN', () => {
    it('should translate IN filter with string array', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'IN',
            value: {
              arrayValue: {
                values: [
                  { stringValue: 'active' },
                  { stringValue: 'pending' },
                  { stringValue: 'verified' }
                ]
              }
            }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ status: { $in: ['active', 'pending', 'verified'] } })
    })

    it('should translate IN filter with integer array', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'role' },
            op: 'IN',
            value: {
              arrayValue: {
                values: [{ integerValue: '1' }, { integerValue: '2' }, { integerValue: '3' }]
              }
            }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ role: { $in: [1, 2, 3] } })
    })

    it('should translate IN filter with mixed value types', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'items' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'id' },
            op: 'IN',
            value: {
              arrayValue: {
                values: [{ stringValue: 'abc' }, { integerValue: '123' }]
              }
            }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ id: { $in: ['abc', 123] } })
    })
  })

  describe('where() Filters - NOT_IN', () => {
    it('should translate NOT_IN filter', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'NOT_IN',
            value: {
              arrayValue: {
                values: [{ stringValue: 'banned' }, { stringValue: 'deleted' }]
              }
            }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ status: { $nin: ['banned', 'deleted'] } })
    })
  })

  describe('where() Filters - ARRAY_CONTAINS', () => {
    it('should translate ARRAY_CONTAINS filter with string value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'tags' },
            op: 'ARRAY_CONTAINS',
            value: { stringValue: 'premium' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ tags: { $elemMatch: { $eq: 'premium' } } })
    })

    it('should translate ARRAY_CONTAINS filter with integer value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'productIds' },
            op: 'ARRAY_CONTAINS',
            value: { integerValue: '42' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ productIds: { $elemMatch: { $eq: 42 } } })
    })
  })

  describe('where() Filters - ARRAY_CONTAINS_ANY', () => {
    it('should translate ARRAY_CONTAINS_ANY filter', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'posts' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'categories' },
            op: 'ARRAY_CONTAINS_ANY',
            value: {
              arrayValue: {
                values: [{ stringValue: 'tech' }, { stringValue: 'science' }]
              }
            }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ categories: { $elemMatch: { $in: ['tech', 'science'] } } })
    })
  })

  describe('where() Filters - Unary Filters', () => {
    it('should translate IS_NULL unary filter', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          unaryFilter: {
            op: 'IS_NULL',
            field: { fieldPath: 'deletedAt' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ deletedAt: { $eq: null } })
    })

    it('should translate IS_NOT_NULL unary filter', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          unaryFilter: {
            op: 'IS_NOT_NULL',
            field: { fieldPath: 'email' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ email: { $ne: null } })
    })

    it('should translate IS_NAN unary filter', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'measurements' }],
        where: {
          unaryFilter: {
            op: 'IS_NAN',
            field: { fieldPath: 'value' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      // MongoDB uses $expr to check for NaN (value !== value is only true for NaN)
      expect(result.filter).toEqual({
        $and: [
          { value: { $type: 'double' } },
          { $expr: { $not: { $eq: ['$value', '$value'] } } }
        ]
      })
    })

    it('should translate IS_NOT_NAN unary filter', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'measurements' }],
        where: {
          unaryFilter: {
            op: 'IS_NOT_NAN',
            field: { fieldPath: 'value' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      // IS_NOT_NAN: field doesn't exist, is not a double, or equals itself (not NaN)
      expect(result.filter).toEqual({
        $or: [
          { value: { $exists: false } },
          { value: { $not: { $type: 'double' } } },
          { $expr: { $eq: ['$value', '$value'] } }
        ]
      })
    })
  })

  describe('orderBy() - Sorting', () => {
    it('should translate single orderBy with ASCENDING direction', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        orderBy: [{ field: { fieldPath: 'name' }, direction: 'ASCENDING' }]
      }

      const result = translateStructuredQuery(query)

      expect(result.sort).toEqual({ name: 1 })
    })

    it('should translate single orderBy with DESCENDING direction', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }]
      }

      const result = translateStructuredQuery(query)

      expect(result.sort).toEqual({ createdAt: -1 })
    })

    it('should default to ASCENDING when direction is unspecified', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        orderBy: [{ field: { fieldPath: 'name' }, direction: 'DIRECTION_UNSPECIFIED' }]
      }

      const result = translateStructuredQuery(query)

      expect(result.sort).toEqual({ name: 1 })
    })

    it('should translate multiple orderBy clauses', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'posts' }],
        orderBy: [
          { field: { fieldPath: 'category' }, direction: 'ASCENDING' },
          { field: { fieldPath: 'publishedAt' }, direction: 'DESCENDING' }
        ]
      }

      const result = translateStructuredQuery(query)

      expect(result.sort).toEqual({ category: 1, publishedAt: -1 })
    })

    it('should handle orderBy with nested field paths', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        orderBy: [{ field: { fieldPath: 'address.city' }, direction: 'ASCENDING' }]
      }

      const result = translateStructuredQuery(query)

      expect(result.sort).toEqual({ 'address.city': 1 })
    })
  })

  describe('limit() and offset()', () => {
    it('should translate limit as number', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        limit: 10
      }

      const result = translateStructuredQuery(query)

      expect(result.limit).toBe(10)
    })

    it('should translate limit as object with value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        limit: { value: 25 }
      }

      const result = translateStructuredQuery(query)

      expect(result.limit).toBe(25)
    })

    it('should translate offset to skip', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        offset: 20
      }

      const result = translateStructuredQuery(query)

      expect(result.skip).toBe(20)
    })

    it('should translate both limit and offset together', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        limit: 10,
        offset: 50
      }

      const result = translateStructuredQuery(query)

      expect(result.limit).toBe(10)
      expect(result.skip).toBe(50)
    })
  })

  describe('Cursors - startAt()', () => {
    it('should translate startAt cursor with single value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        orderBy: [{ field: { fieldPath: 'age' }, direction: 'ASCENDING' }],
        startAt: {
          values: [{ integerValue: '25' }],
          before: false
        }
      }

      const result = translateStructuredQuery(query)

      // startAt with before: false means >=
      expect(result.filter).toEqual({ age: { $gte: 25 } })
    })

    it('should translate startAt cursor with before: true (exclusive)', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        orderBy: [{ field: { fieldPath: 'age' }, direction: 'ASCENDING' }],
        startAt: {
          values: [{ integerValue: '25' }],
          before: true
        }
      }

      const result = translateStructuredQuery(query)

      // startAt with before: true means > (exclusive start)
      expect(result.filter).toEqual({ age: { $gt: 25 } })
    })

    it('should translate startAt with multiple values for compound cursors', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'posts' }],
        orderBy: [
          { field: { fieldPath: 'category' }, direction: 'ASCENDING' },
          { field: { fieldPath: 'publishedAt' }, direction: 'DESCENDING' }
        ],
        startAt: {
          values: [{ stringValue: 'tech' }, { timestampValue: '2024-01-01T00:00:00Z' }],
          before: false
        }
      }

      const result = translateStructuredQuery(query)

      // Compound cursor should create appropriate filter
      expect(result.filter).toBeDefined()
      expect(result.filter).toHaveProperty('$or')
    })
  })

  describe('Cursors - startAfter()', () => {
    it('should translate startAfter cursor (startAt with before: true)', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        orderBy: [{ field: { fieldPath: 'name' }, direction: 'ASCENDING' }],
        startAt: {
          values: [{ stringValue: 'John' }],
          before: true
        }
      }

      const result = translateStructuredQuery(query)

      // startAfter means strictly greater than
      expect(result.filter).toEqual({ name: { $gt: 'John' } })
    })
  })

  describe('Cursors - DESCENDING order', () => {
    it('should translate startAt cursor with DESCENDING order', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'scores' }],
        orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
        startAt: {
          values: [{ integerValue: '100' }],
          before: false
        }
      }

      const result = translateStructuredQuery(query)

      // For DESCENDING order, startAt(100) means start from score 100 going down
      // So we need scores <= 100
      expect(result.filter).toEqual({ score: { $lte: 100 } })
    })

    it('should translate startAfter cursor with DESCENDING order', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'scores' }],
        orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
        startAt: {
          values: [{ integerValue: '100' }],
          before: true
        }
      }

      const result = translateStructuredQuery(query)

      // For DESCENDING order, startAfter(100) means start from scores < 100
      expect(result.filter).toEqual({ score: { $lt: 100 } })
    })

    it('should translate endAt cursor with DESCENDING order', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'scores' }],
        orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
        endAt: {
          values: [{ integerValue: '50' }],
          before: false
        }
      }

      const result = translateStructuredQuery(query)

      // For DESCENDING order, endAt(50) means end at score 50 (inclusive)
      // So we need scores >= 50
      expect(result.filter).toEqual({ score: { $gte: 50 } })
    })

    it('should translate range query with DESCENDING order', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'scores' }],
        orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
        startAt: {
          values: [{ integerValue: '100' }],
          before: false
        },
        endAt: {
          values: [{ integerValue: '50' }],
          before: false
        }
      }

      const result = translateStructuredQuery(query)

      // Range from 100 down to 50 (inclusive) in DESCENDING order
      // Score must be <= 100 AND >= 50
      expect(result.filter).toEqual({
        score: { $lte: 100, $gte: 50 }
      })
    })
  })

  describe('Cursors - endAt()', () => {
    it('should translate endAt cursor with single value', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        orderBy: [{ field: { fieldPath: 'age' }, direction: 'ASCENDING' }],
        endAt: {
          values: [{ integerValue: '65' }],
          before: false
        }
      }

      const result = translateStructuredQuery(query)

      // endAt with before: false means <=
      expect(result.filter).toEqual({ age: { $lte: 65 } })
    })

    it('should translate endAt with before: true (exclusive)', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        orderBy: [{ field: { fieldPath: 'age' }, direction: 'ASCENDING' }],
        endAt: {
          values: [{ integerValue: '65' }],
          before: true
        }
      }

      const result = translateStructuredQuery(query)

      // endAt with before: true means <
      expect(result.filter).toEqual({ age: { $lt: 65 } })
    })
  })

  describe('Cursors - endBefore()', () => {
    it('should translate endBefore cursor (endAt with before: true)', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
        endAt: {
          values: [{ integerValue: '100' }],
          before: true
        }
      }

      const result = translateStructuredQuery(query)

      // endBefore with descending order
      expect(result.filter).toEqual({ score: { $gt: 100 } })
    })
  })

  describe('Cursors - Combined startAt and endAt', () => {
    it('should translate range query with both startAt and endAt', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        orderBy: [{ field: { fieldPath: 'age' }, direction: 'ASCENDING' }],
        startAt: {
          values: [{ integerValue: '18' }],
          before: false
        },
        endAt: {
          values: [{ integerValue: '65' }],
          before: false
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({
        age: { $gte: 18, $lte: 65 }
      })
    })
  })

  describe('Compound Queries - Multiple where clauses with AND', () => {
    it('should translate composite AND filter with two conditions', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'age' },
                  op: 'GREATER_THAN',
                  value: { integerValue: '18' }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'status' },
                  op: 'EQUAL',
                  value: { stringValue: 'active' }
                }
              }
            ]
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({
        $and: [{ age: { $gt: 18 } }, { status: { $eq: 'active' } }]
      })
    })

    it('should translate composite AND filter with multiple conditions', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'products' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'price' },
                  op: 'GREATER_THAN_OR_EQUAL',
                  value: { doubleValue: 10.0 }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'price' },
                  op: 'LESS_THAN_OR_EQUAL',
                  value: { doubleValue: 100.0 }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'inStock' },
                  op: 'EQUAL',
                  value: { booleanValue: true }
                }
              }
            ]
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({
        $and: [
          { price: { $gte: 10.0 } },
          { price: { $lte: 100.0 } },
          { inStock: { $eq: true } }
        ]
      })
    })
  })

  describe('Compound Queries - Multiple where clauses with OR', () => {
    it('should translate composite OR filter', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          compositeFilter: {
            op: 'OR',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'role' },
                  op: 'EQUAL',
                  value: { stringValue: 'admin' }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'role' },
                  op: 'EQUAL',
                  value: { stringValue: 'moderator' }
                }
              }
            ]
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({
        $or: [{ role: { $eq: 'admin' } }, { role: { $eq: 'moderator' } }]
      })
    })
  })

  describe('Compound Queries - Nested composite filters', () => {
    it('should translate nested AND/OR composite filters', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'active' },
                  op: 'EQUAL',
                  value: { booleanValue: true }
                }
              },
              {
                compositeFilter: {
                  op: 'OR',
                  filters: [
                    {
                      fieldFilter: {
                        field: { fieldPath: 'role' },
                        op: 'EQUAL',
                        value: { stringValue: 'admin' }
                      }
                    },
                    {
                      fieldFilter: {
                        field: { fieldPath: 'premium' },
                        op: 'EQUAL',
                        value: { booleanValue: true }
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({
        $and: [
          { active: { $eq: true } },
          {
            $or: [{ role: { $eq: 'admin' } }, { premium: { $eq: true } }]
          }
        ]
      })
    })
  })

  describe('Field Paths - Nested Properties', () => {
    it('should translate filter with single level nested field path', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'address.city' },
            op: 'EQUAL',
            value: { stringValue: 'New York' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ 'address.city': { $eq: 'New York' } })
    })

    it('should translate filter with deeply nested field path', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'profile.settings.notifications.email' },
            op: 'EQUAL',
            value: { booleanValue: true }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({
        'profile.settings.notifications.email': { $eq: true }
      })
    })

    it('should translate multiple filters with nested field paths', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'address.country' },
                  op: 'EQUAL',
                  value: { stringValue: 'USA' }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'address.zipCode' },
                  op: 'GREATER_THAN',
                  value: { stringValue: '10000' }
                }
              }
            ]
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({
        $and: [
          { 'address.country': { $eq: 'USA' } },
          { 'address.zipCode': { $gt: '10000' } }
        ]
      })
    })

    it('should translate orderBy with nested field paths', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        orderBy: [
          { field: { fieldPath: 'profile.lastLogin' }, direction: 'DESCENDING' },
          { field: { fieldPath: 'profile.name.lastName' }, direction: 'ASCENDING' }
        ]
      }

      const result = translateStructuredQuery(query)

      expect(result.sort).toEqual({
        'profile.lastLogin': -1,
        'profile.name.lastName': 1
      })
    })
  })

  describe('Field Paths - Special Characters', () => {
    it('should handle field paths with backtick escaping', () => {
      // Firestore uses backticks to escape field names with special characters
      const query: StructuredQuery = {
        from: [{ collectionId: 'data' }],
        where: {
          fieldFilter: {
            field: { fieldPath: '`field.with.dots`' },
            op: 'EQUAL',
            value: { stringValue: 'value' }
          }
        }
      }

      const result = translateStructuredQuery(query)

      // The backticks should be processed appropriately
      expect(result.filter).toBeDefined()
    })
  })

  describe('Projection (select)', () => {
    it('should translate select with specific fields', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        select: {
          fields: [{ fieldPath: 'name' }, { fieldPath: 'email' }, { fieldPath: 'age' }]
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.projection).toEqual({
        name: 1,
        email: 1,
        age: 1
      })
    })

    it('should translate select with nested field paths', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        select: {
          fields: [
            { fieldPath: 'name' },
            { fieldPath: 'address.city' },
            { fieldPath: 'address.country' }
          ]
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.projection).toEqual({
        name: 1,
        'address.city': 1,
        'address.country': 1
      })
    })
  })

  describe('Complex Combined Queries', () => {
    it('should translate full query with filter, orderBy, limit, and offset', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'age' },
                  op: 'GREATER_THAN',
                  value: { integerValue: '18' }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'status' },
                  op: 'EQUAL',
                  value: { stringValue: 'active' }
                }
              }
            ]
          }
        },
        orderBy: [{ field: { fieldPath: 'name' }, direction: 'ASCENDING' }],
        limit: 10,
        offset: 20
      }

      const result = translateStructuredQuery(query)

      expect(result.collection).toBe('users')
      expect(result.filter).toEqual({
        $and: [{ age: { $gt: 18 } }, { status: { $eq: 'active' } }]
      })
      expect(result.sort).toEqual({ name: 1 })
      expect(result.limit).toBe(10)
      expect(result.skip).toBe(20)
    })

    it('should translate query matching the example from issue description', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'age' },
            op: 'GREATER_THAN',
            value: { integerValue: '18' }
          }
        },
        orderBy: [{ field: { fieldPath: 'name' }, direction: 'ASCENDING' }],
        limit: 10
      }

      const result = translateStructuredQuery(query)

      expect(result.collection).toBe('users')
      expect(result.filter).toEqual({ age: { $gt: 18 } })
      expect(result.sort).toEqual({ name: 1 })
      expect(result.limit).toBe(10)
    })

    it('should translate complex e-commerce product query', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'products' }],
        select: {
          fields: [
            { fieldPath: 'name' },
            { fieldPath: 'price' },
            { fieldPath: 'category' },
            { fieldPath: 'ratings.average' }
          ]
        },
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'category' },
                  op: 'IN',
                  value: {
                    arrayValue: {
                      values: [{ stringValue: 'electronics' }, { stringValue: 'computers' }]
                    }
                  }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'price' },
                  op: 'LESS_THAN_OR_EQUAL',
                  value: { doubleValue: 1000.0 }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'ratings.average' },
                  op: 'GREATER_THAN_OR_EQUAL',
                  value: { doubleValue: 4.0 }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'inStock' },
                  op: 'EQUAL',
                  value: { booleanValue: true }
                }
              }
            ]
          }
        },
        orderBy: [
          { field: { fieldPath: 'ratings.average' }, direction: 'DESCENDING' },
          { field: { fieldPath: 'price' }, direction: 'ASCENDING' }
        ],
        limit: 20
      }

      const result = translateStructuredQuery(query)

      expect(result.collection).toBe('products')
      expect(result.projection).toEqual({
        name: 1,
        price: 1,
        category: 1,
        'ratings.average': 1
      })
      expect(result.filter).toEqual({
        $and: [
          { category: { $in: ['electronics', 'computers'] } },
          { price: { $lte: 1000.0 } },
          { 'ratings.average': { $gte: 4.0 } },
          { inStock: { $eq: true } }
        ]
      })
      expect(result.sort).toEqual({
        'ratings.average': -1,
        price: 1
      })
      expect(result.limit).toBe(20)
    })
  })

  describe('Value Type Conversions', () => {
    it('should convert string-encoded integers to numbers', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'count' },
            op: 'EQUAL',
            value: { integerValue: '9007199254740991' } // Max safe integer as string
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter).toEqual({ count: { $eq: 9007199254740991 } })
    })

    it('should handle timestamp values with seconds and nanos', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'events' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'timestamp' },
            op: 'GREATER_THAN',
            value: {
              timestampValue: {
                seconds: 1704067200,
                nanos: 500000000
              }
            }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter?.timestamp).toHaveProperty('$gt')
    })

    it('should handle geopoint values', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'locations' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'coordinates' },
            op: 'EQUAL',
            value: {
              geoPointValue: {
                latitude: 37.7749,
                longitude: -122.4194
              }
            }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter?.coordinates).toBeDefined()
    })

    it('should handle reference values', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'comments' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'authorRef' },
            op: 'EQUAL',
            value: {
              referenceValue: 'projects/my-project/databases/(default)/documents/users/user123'
            }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter?.authorRef).toBeDefined()
    })

    it('should handle map values in filters', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'configs' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'settings' },
            op: 'EQUAL',
            value: {
              mapValue: {
                fields: {
                  theme: { stringValue: 'dark' },
                  notifications: { booleanValue: true }
                }
              }
            }
          }
        }
      }

      const result = translateStructuredQuery(query)

      expect(result.filter?.settings).toBeDefined()
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty query', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }]
      }

      const result = translateStructuredQuery(query)

      expect(result.collection).toBe('users')
      expect(result.filter).toBeUndefined()
      expect(result.sort).toBeUndefined()
      expect(result.limit).toBeUndefined()
      expect(result.skip).toBeUndefined()
    })

    it('should handle query with only orderBy', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'posts' }],
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }]
      }

      const result = translateStructuredQuery(query)

      expect(result.collection).toBe('posts')
      expect(result.sort).toEqual({ createdAt: -1 })
      expect(result.filter).toBeUndefined()
    })

    it('should handle query with only limit', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        limit: 5
      }

      const result = translateStructuredQuery(query)

      expect(result.collection).toBe('users')
      expect(result.limit).toBe(5)
    })

    it('should handle zero limit', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        limit: 0
      }

      const result = translateStructuredQuery(query)

      expect(result.limit).toBe(0)
    })

    it('should handle zero offset', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        offset: 0
      }

      const result = translateStructuredQuery(query)

      expect(result.skip).toBe(0)
    })

    it('should handle empty composite filter', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: []
          }
        }
      }

      const result = translateStructuredQuery(query)

      // Empty AND should result in no filter or match-all
      expect(result.filter).toEqual({ $and: [] })
    })

    it('should handle single filter in composite', () => {
      const query: StructuredQuery = {
        from: [{ collectionId: 'users' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'active' },
                  op: 'EQUAL',
                  value: { booleanValue: true }
                }
              }
            ]
          }
        }
      }

      const result = translateStructuredQuery(query)

      // Single filter in AND could be simplified
      expect(result.filter).toEqual({
        $and: [{ active: { $eq: true } }]
      })
    })
  })
})
