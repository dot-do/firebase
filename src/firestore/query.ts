/**
 * Firestore StructuredQuery to MongoDB Query Translation
 *
 * This module translates Firestore's StructuredQuery format to MongoDB-compatible
 * queries that can be executed against a mongo.do backend.
 *
 * Reference: https://cloud.google.com/firestore/docs/reference/rest/v1/StructuredQuery
 */

// =============================================================================
// Type Definitions - Firestore StructuredQuery Types
// =============================================================================

export type FieldFilterOp =
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

export type CompositeFilterOp = 'OPERATOR_UNSPECIFIED' | 'AND' | 'OR'

export type UnaryFilterOp = 'OPERATOR_UNSPECIFIED' | 'IS_NAN' | 'IS_NULL' | 'IS_NOT_NAN' | 'IS_NOT_NULL'

export type OrderDirection = 'DIRECTION_UNSPECIFIED' | 'ASCENDING' | 'DESCENDING'

export interface FieldReference {
  fieldPath: string
}

export interface FirestoreValue {
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

export interface FieldFilter {
  field: FieldReference
  op: FieldFilterOp
  value: FirestoreValue
}

export interface UnaryFilter {
  op: UnaryFilterOp
  field: FieldReference
}

export interface CompositeFilter {
  op: CompositeFilterOp
  filters: Filter[]
}

export interface Filter {
  compositeFilter?: CompositeFilter
  fieldFilter?: FieldFilter
  unaryFilter?: UnaryFilter
}

export interface Order {
  field: FieldReference
  direction?: OrderDirection
}

export interface Cursor {
  values: FirestoreValue[]
  before?: boolean
}

export interface CollectionSelector {
  collectionId: string
  allDescendants?: boolean
}

export interface Projection {
  fields?: FieldReference[]
}

export interface StructuredQuery {
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

export interface MongoQuery {
  collection: string
  filter?: Record<string, unknown>
  sort?: Record<string, 1 | -1>
  limit?: number
  skip?: number
  projection?: Record<string, 1 | 0>
}

// =============================================================================
// Value Conversion Functions
// =============================================================================

/**
 * Converts a Firestore value to a JavaScript value
 */
function convertFirestoreValue(value: FirestoreValue): unknown {
  // Check for null value
  if ('nullValue' in value) {
    return null
  }

  // Check for boolean value
  if ('booleanValue' in value) {
    return value.booleanValue
  }

  // Check for integer value
  if ('integerValue' in value) {
    const intValue = value.integerValue
    return typeof intValue === 'string' ? Number(intValue) : intValue
  }

  // Check for double value
  if ('doubleValue' in value) {
    const doubleValue = value.doubleValue
    return typeof doubleValue === 'string' ? Number(doubleValue) : doubleValue
  }

  // Check for string value
  if ('stringValue' in value) {
    return value.stringValue
  }

  // Check for timestamp value
  if ('timestampValue' in value) {
    const timestamp = value.timestampValue
    if (typeof timestamp === 'string') {
      return new Date(timestamp)
    } else if (typeof timestamp === 'object') {
      const seconds = typeof timestamp.seconds === 'string'
        ? Number(timestamp.seconds)
        : timestamp.seconds || 0
      const nanos = timestamp.nanos || 0
      return new Date(seconds * 1000 + nanos / 1000000)
    }
  }

  // Check for reference value
  if ('referenceValue' in value) {
    return value.referenceValue
  }

  // Check for geopoint value
  if ('geoPointValue' in value) {
    return value.geoPointValue
  }

  // Check for array value
  if ('arrayValue' in value) {
    const arrayValue = value.arrayValue
    if (!arrayValue || !arrayValue.values) {
      return []
    }
    return arrayValue.values.map(convertFirestoreValue)
  }

  // Check for map value
  if ('mapValue' in value) {
    const mapValue = value.mapValue
    if (!mapValue || !mapValue.fields) {
      return {}
    }
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(mapValue.fields)) {
      result[key] = convertFirestoreValue(val)
    }
    return result
  }

  // Check for bytes value
  if ('bytesValue' in value) {
    return value.bytesValue
  }

  throw new Error(`Unsupported Firestore value type: ${JSON.stringify(value)}`)
}

// =============================================================================
// Filter Translation Functions
// =============================================================================

/**
 * Translates a field filter operator to MongoDB operator
 */
function translateFieldFilterOp(op: FieldFilterOp): string {
  switch (op) {
    case 'EQUAL':
      return '$eq'
    case 'NOT_EQUAL':
      return '$ne'
    case 'LESS_THAN':
      return '$lt'
    case 'LESS_THAN_OR_EQUAL':
      return '$lte'
    case 'GREATER_THAN':
      return '$gt'
    case 'GREATER_THAN_OR_EQUAL':
      return '$gte'
    case 'IN':
      return '$in'
    case 'NOT_IN':
      return '$nin'
    case 'ARRAY_CONTAINS':
      return '$elemMatch'
    case 'ARRAY_CONTAINS_ANY':
      return '$elemMatch'
    case 'OPERATOR_UNSPECIFIED':
    default:
      throw new Error(`Unsupported field filter operator: ${op}`)
  }
}

/**
 * Translates a field filter to MongoDB query condition
 */
function translateFieldFilter(filter: FieldFilter): Record<string, unknown> {
  const fieldPath = filter.field.fieldPath
  const op = filter.op
  const value = convertFirestoreValue(filter.value)

  // Special handling for ARRAY_CONTAINS
  if (op === 'ARRAY_CONTAINS') {
    return {
      [fieldPath]: {
        $elemMatch: { $eq: value }
      }
    }
  }

  // Special handling for ARRAY_CONTAINS_ANY
  if (op === 'ARRAY_CONTAINS_ANY') {
    return {
      [fieldPath]: {
        $elemMatch: { $in: value as unknown[] }
      }
    }
  }

  // Standard operators
  const mongoOp = translateFieldFilterOp(op)
  return {
    [fieldPath]: {
      [mongoOp]: value
    }
  }
}

/**
 * Translates a unary filter to MongoDB query condition
 */
function translateUnaryFilter(filter: UnaryFilter): Record<string, unknown> {
  const fieldPath = filter.field.fieldPath
  const op = filter.op

  switch (op) {
    case 'IS_NULL':
      return { [fieldPath]: { $eq: null } }
    case 'IS_NOT_NULL':
      return { [fieldPath]: { $ne: null } }
    case 'IS_NAN':
      // Use $expr with $isNumber check and NaN comparison via $eq with special handling
      // MongoDB doesn't have a direct $isNaN, but we can check if value equals itself
      // NaN is the only value where value !== value
      return {
        $and: [
          { [fieldPath]: { $type: 'double' } },
          { $expr: { $not: { $eq: [`$${fieldPath}`, `$${fieldPath}`] } } }
        ]
      }
    case 'IS_NOT_NAN':
      // Document is not NaN if: field doesn't exist, is not a double, or equals itself
      return {
        $or: [
          { [fieldPath]: { $exists: false } },
          { [fieldPath]: { $not: { $type: 'double' } } },
          { $expr: { $eq: [`$${fieldPath}`, `$${fieldPath}`] } }
        ]
      }
    default:
      throw new Error(`Unsupported unary filter operator: ${op}`)
  }
}

/**
 * Translates a composite filter to MongoDB query condition
 */
function translateCompositeFilter(filter: CompositeFilter): Record<string, unknown> {
  const op = filter.op
  const filters = filter.filters

  if (op === 'AND') {
    const conditions = filters.map(translateFilter)
    return { $and: conditions }
  }

  if (op === 'OR') {
    const conditions = filters.map(translateFilter)
    return { $or: conditions }
  }

  throw new Error(`Unsupported composite filter operator: ${op}`)
}

/**
 * Translates a filter to MongoDB query condition
 */
function translateFilter(filter: Filter): Record<string, unknown> {
  if (filter.compositeFilter) {
    return translateCompositeFilter(filter.compositeFilter)
  }

  if (filter.fieldFilter) {
    return translateFieldFilter(filter.fieldFilter)
  }

  if (filter.unaryFilter) {
    return translateUnaryFilter(filter.unaryFilter)
  }

  throw new Error('Invalid filter: no filter type specified')
}

// =============================================================================
// Order Translation Functions
// =============================================================================

/**
 * Translates orderBy clauses to MongoDB sort specification
 */
function translateOrderBy(orders: Order[]): Record<string, 1 | -1> {
  const sort: Record<string, 1 | -1> = {}

  for (const order of orders) {
    const fieldPath = order.field.fieldPath
    const direction = order.direction || 'DIRECTION_UNSPECIFIED'

    if (direction === 'DESCENDING') {
      sort[fieldPath] = -1
    } else {
      // Default to ASCENDING for DIRECTION_UNSPECIFIED or ASCENDING
      sort[fieldPath] = 1
    }
  }

  return sort
}

// =============================================================================
// Cursor Translation Functions
// =============================================================================

/**
 * Translates cursor to MongoDB filter condition
 *
 * Cursors in Firestore work with orderBy to create range queries.
 * - startAt with before=false means >= (inclusive start)
 * - startAt with before=true means > (exclusive start, aka startAfter)
 * - endAt with before=false means <= (inclusive end)
 * - endAt with before=true means < (exclusive end, aka endBefore)
 */
function translateCursor(
  cursor: Cursor,
  orderBy: Order[] | undefined,
  isStart: boolean
): Record<string, unknown> | undefined {
  if (!orderBy || orderBy.length === 0) {
    return undefined
  }

  // For simple single-field cursors
  if (cursor.values.length === 1 && orderBy.length === 1) {
    const fieldPath = orderBy[0].field.fieldPath
    const direction = orderBy[0].direction || 'ASCENDING'
    const value = convertFirestoreValue(cursor.values[0])
    const before = cursor.before ?? false

    // Determine the operator based on cursor type, before flag, and direction
    let operator: string

    if (isStart) {
      // startAt cursor
      if (direction === 'DESCENDING') {
        // For descending order, startAt means we start from higher values
        operator = before ? '$lt' : '$lte'
      } else {
        // For ascending order, startAt means we start from lower values
        operator = before ? '$gt' : '$gte'
      }
    } else {
      // endAt cursor
      if (direction === 'DESCENDING') {
        // For descending order, endAt means we end at lower values
        operator = before ? '$gt' : '$gte'
      } else {
        // For ascending order, endAt means we end at higher values
        operator = before ? '$lt' : '$lte'
      }
    }

    return {
      [fieldPath]: {
        [operator]: value
      }
    }
  }

  // For compound cursors with multiple fields, we need to create $or conditions
  // This is a more complex case that requires careful handling
  if (cursor.values.length > 1 && orderBy.length > 1) {
    const conditions: Record<string, unknown>[] = []

    // Build compound cursor conditions
    for (let i = 0; i < cursor.values.length && i < orderBy.length; i++) {
      const fieldPath = orderBy[i].field.fieldPath
      const direction = orderBy[i].direction || 'ASCENDING'
      const value = convertFirestoreValue(cursor.values[i])
      const before = cursor.before ?? false

      const condition: Record<string, unknown> = {}

      // Add equality conditions for all previous fields
      for (let j = 0; j < i; j++) {
        const prevFieldPath = orderBy[j].field.fieldPath
        const prevValue = convertFirestoreValue(cursor.values[j])
        condition[prevFieldPath] = { $eq: prevValue }
      }

      // Add the range condition for the current field
      let operator: string
      if (isStart) {
        if (direction === 'DESCENDING') {
          operator = before ? '$lt' : '$lte'
        } else {
          operator = before ? '$gt' : '$gte'
        }
      } else {
        if (direction === 'DESCENDING') {
          operator = before ? '$gt' : '$gte'
        } else {
          operator = before ? '$lt' : '$lte'
        }
      }

      condition[fieldPath] = { [operator]: value }
      conditions.push(condition)
    }

    return { $or: conditions }
  }

  return undefined
}

/**
 * Merges cursor filters with existing where filters
 */
function mergeCursorFilters(
  whereFilter: Record<string, unknown> | undefined,
  startCursor: Record<string, unknown> | undefined,
  endCursor: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const filters: Record<string, unknown>[] = []

  if (whereFilter) {
    filters.push(whereFilter)
  }

  if (startCursor) {
    filters.push(startCursor)
  }

  if (endCursor) {
    filters.push(endCursor)
  }

  if (filters.length === 0) {
    return undefined
  }

  if (filters.length === 1) {
    return filters[0]
  }

  // Merge filters intelligently
  // Check if we can merge into a single field condition
  const allSameField = filters.every((f) => {
    const keys = Object.keys(f)
    return keys.length === 1 && keys[0] === Object.keys(filters[0])[0] &&
           typeof f[keys[0]] === 'object' && f[keys[0]] !== null
  })

  if (allSameField) {
    const fieldPath = Object.keys(filters[0])[0]
    const merged: Record<string, unknown> = {}

    for (const filter of filters) {
      const condition = filter[fieldPath] as Record<string, unknown>
      Object.assign(merged, condition)
    }

    return { [fieldPath]: merged }
  }

  // Otherwise use $and
  return { $and: filters }
}

// =============================================================================
// Projection Translation Functions
// =============================================================================

/**
 * Translates select/projection to MongoDB projection specification
 */
function translateProjection(projection: Projection): Record<string, 1 | 0> {
  const result: Record<string, 1 | 0> = {}

  if (projection.fields) {
    for (const field of projection.fields) {
      result[field.fieldPath] = 1
    }
  }

  return result
}

// =============================================================================
// Main Translation Function
// =============================================================================

/**
 * Translates a Firestore StructuredQuery to a MongoDB-compatible query
 *
 * @param query - The Firestore StructuredQuery to translate
 * @returns A MongoDB query object compatible with mongo.do
 * @throws Error if the query contains unsupported features
 */
export function translateStructuredQuery(query: StructuredQuery): MongoQuery {
  const result: MongoQuery = {
    collection: ''
  }

  // Translate collection selector (from)
  if (query.from && query.from.length > 0) {
    result.collection = query.from[0].collectionId
  } else {
    throw new Error('StructuredQuery must specify a collection in "from"')
  }

  // Translate where filters
  let whereFilter: Record<string, unknown> | undefined
  if (query.where) {
    whereFilter = translateFilter(query.where)
  }

  // Translate cursors
  const startCursorFilter = query.startAt
    ? translateCursor(query.startAt, query.orderBy, true)
    : undefined

  const endCursorFilter = query.endAt
    ? translateCursor(query.endAt, query.orderBy, false)
    : undefined

  // Merge all filters
  const mergedFilter = mergeCursorFilters(whereFilter, startCursorFilter, endCursorFilter)
  if (mergedFilter) {
    result.filter = mergedFilter
  }

  // Translate orderBy
  if (query.orderBy && query.orderBy.length > 0) {
    result.sort = translateOrderBy(query.orderBy)
  }

  // Translate limit
  if (query.limit !== undefined) {
    result.limit = typeof query.limit === 'number'
      ? query.limit
      : query.limit.value
  }

  // Translate offset
  if (query.offset !== undefined) {
    result.skip = query.offset
  }

  // Translate projection (select)
  if (query.select && query.select.fields) {
    result.projection = translateProjection(query.select)
  }

  return result
}

/**
 * Executes a query against the in-memory document store
 *
 * @param query - The StructuredQuery to execute
 * @param projectId - Firebase project ID
 * @param databaseId - Firestore database ID (default: "(default)")
 * @returns Query results with documents and metadata
 */
export async function runQuery(
  query: StructuredQuery,
  projectId: string = 'default-project',
  databaseId: string = '(default)'
): Promise<QueryResult> {
  const { getAllDocuments } = await import('./crud.js')

  // Translate the query to understand what we need
  const mongoQuery = translateStructuredQuery(query)

  // Build the collection path prefix
  const collectionPrefix = `projects/${projectId}/databases/${databaseId}/documents/${mongoQuery.collection}/`

  // Get all documents from the store
  const allDocuments = getAllDocuments()
  const collectionDocs: Array<{
    name: string
    fields: Record<string, FirestoreValue>
    createTime?: string
    updateTime?: string
    data: Record<string, unknown> // JavaScript version for filtering
  }> = []

  // Filter documents to only those in the target collection
  for (const [path, doc] of allDocuments.entries()) {
    if (path.startsWith(collectionPrefix)) {
      // Check it's a direct child (not in a subcollection)
      const relativePath = path.slice(collectionPrefix.length)
      if (!relativePath.includes('/')) {
        // Convert fields to JavaScript for filtering
        const data: Record<string, unknown> = {}
        if (doc.fields) {
          for (const [key, value] of Object.entries(doc.fields)) {
            data[key] = convertFirestoreValue(value as FirestoreValue)
          }
        }
        collectionDocs.push({
          name: doc.name,
          fields: (doc.fields || {}) as Record<string, FirestoreValue>,
          createTime: doc.createTime,
          updateTime: doc.updateTime,
          data,
        })
      }
    }
  }

  // Apply filter if present
  let filteredDocs = collectionDocs
  if (mongoQuery.filter) {
    filteredDocs = collectionDocs.filter((doc) =>
      matchesFilter(doc.data, mongoQuery.filter!)
    )
  }

  // Apply sorting
  if (mongoQuery.sort) {
    const sortEntries = Object.entries(mongoQuery.sort)
    filteredDocs.sort((a, b) => {
      for (const [field, direction] of sortEntries) {
        const aVal = getNestedField(a.data, field)
        const bVal = getNestedField(b.data, field)
        const cmp = compareValues(aVal, bVal)
        if (cmp !== 0) {
          return direction === 1 ? cmp : -cmp
        }
      }
      return 0
    })
  }

  // Apply offset (skip)
  const skippedResults = mongoQuery.skip || 0
  if (skippedResults > 0) {
    filteredDocs = filteredDocs.slice(skippedResults)
  }

  // Apply limit
  if (mongoQuery.limit !== undefined) {
    filteredDocs = filteredDocs.slice(0, mongoQuery.limit)
  }

  // Apply projection if needed
  const documents: QueryDocument[] = filteredDocs.map((doc) => {
    let fields = doc.fields
    if (mongoQuery.projection && Object.keys(mongoQuery.projection).length > 0) {
      fields = {}
      for (const fieldPath of Object.keys(mongoQuery.projection)) {
        if (mongoQuery.projection[fieldPath] === 1 && doc.fields[fieldPath]) {
          fields[fieldPath] = doc.fields[fieldPath]
        }
      }
    }
    return {
      name: doc.name,
      fields,
      createTime: doc.createTime,
      updateTime: doc.updateTime,
    }
  })

  return {
    documents,
    metadata: {
      skippedResults: skippedResults > 0 ? skippedResults : undefined,
      readTime: new Date().toISOString(),
    },
  }
}

/**
 * Get a nested field value from an object using dot notation
 */
function getNestedField(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Compare two values for sorting
 */
function compareValues(a: unknown, b: unknown): number {
  // Handle null/undefined
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1
  if (b === null || b === undefined) return 1

  // Handle dates
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime()
  }

  // Handle numbers
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  // Handle strings
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b)
  }

  // Handle booleans
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return a === b ? 0 : a ? 1 : -1
  }

  // Fallback: convert to string and compare
  return String(a).localeCompare(String(b))
}

/**
 * Check if a document matches a MongoDB-style filter
 */
function matchesFilter(data: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [key, condition] of Object.entries(filter)) {
    // Handle logical operators
    if (key === '$and') {
      const conditions = condition as Record<string, unknown>[]
      if (!conditions.every((c) => matchesFilter(data, c))) {
        return false
      }
      continue
    }

    if (key === '$or') {
      const conditions = condition as Record<string, unknown>[]
      if (!conditions.some((c) => matchesFilter(data, c))) {
        return false
      }
      continue
    }

    // Regular field condition
    const fieldValue = getNestedField(data, key)

    if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
      // Condition is an object with operators
      const operators = condition as Record<string, unknown>
      for (const [op, expected] of Object.entries(operators)) {
        if (!matchesOperator(fieldValue, op, expected)) {
          return false
        }
      }
    } else {
      // Direct equality
      if (!deepEqual(fieldValue, condition)) {
        return false
      }
    }
  }
  return true
}

/**
 * Check if a value matches a MongoDB operator condition
 */
function matchesOperator(value: unknown, op: string, expected: unknown): boolean {
  switch (op) {
    case '$eq':
      return deepEqual(value, expected)
    case '$ne':
      return !deepEqual(value, expected)
    case '$lt':
      return compareValues(value, expected) < 0
    case '$lte':
      return compareValues(value, expected) <= 0
    case '$gt':
      return compareValues(value, expected) > 0
    case '$gte':
      return compareValues(value, expected) >= 0
    case '$in':
      if (!Array.isArray(expected)) return false
      return expected.some((e) => deepEqual(value, e))
    case '$nin':
      if (!Array.isArray(expected)) return false
      return !expected.some((e) => deepEqual(value, e))
    case '$elemMatch':
      if (!Array.isArray(value)) return false
      // For simple ARRAY_CONTAINS, expected is the value to find
      return value.some((v) => deepEqual(v, expected))
    default:
      console.warn(`Unknown operator: ${op}`)
      return true
  }
}

/**
 * Deep equality check
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((val, i) => deepEqual(val, b[i]))
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>
    const aKeys = Object.keys(aObj)
    const bKeys = Object.keys(bObj)
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]))
  }

  return false
}

/**
 * Query result with documents and metadata
 */
export interface QueryResult {
  documents: QueryDocument[]
  metadata?: QueryMetadata
}

/**
 * Query document with data and metadata
 */
export interface QueryDocument {
  name: string
  fields: Record<string, FirestoreValue>
  createTime?: string
  updateTime?: string
}

/**
 * Query execution metadata
 */
export interface QueryMetadata {
  skippedResults?: number
  readTime?: string
}
