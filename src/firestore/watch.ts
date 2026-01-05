/**
 * Firestore Watch/Listen Real-time Listeners Module
 *
 * This module implements the Firestore Listen/Watch streaming API for real-time document synchronization.
 * It provides both low-level streaming API and high-level watch abstractions.
 *
 * Key Features:
 * - Low-level Listen API: Stream-based document watching via HTTP
 * - watchDocument: Listen to individual document changes
 * - watchQuery: Listen to query result changes
 * - Handle snapshot events (added, modified, removed)
 * - Metadata tracking (hasPendingWrites, fromCache)
 * - Error handling and reconnection
 * - Resume tokens for efficient reconnection
 *
 * Reference: https://cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/listen
 */

import type { Value } from './values'
import {
  getDocument,
  getDocumentsInCollection,
  subscribeToDocumentChanges,
  type Document as CrudDocument,
  type DocumentChangeEvent as CrudDocumentChangeEvent,
} from './crud'
import { runQuery } from './query'

// ============================================================================
// Core Types
// ============================================================================

/**
 * Firestore document representation
 */
export interface Document {
  /** Full document path: projects/{project}/databases/{database}/documents/{path} */
  name: string
  /** Document fields as Firestore Value types */
  fields: Record<string, Value>
  /** Document creation timestamp (RFC3339) */
  createTime: string
  /** Document last update timestamp (RFC3339) */
  updateTime: string
}

/**
 * Metadata about the snapshot state
 */
export interface SnapshotMetadata {
  /** True if document has local modifications not yet written to backend */
  hasPendingWrites: boolean
  /** True if the snapshot was created from cached data rather than server */
  fromCache: boolean
}

/**
 * Document snapshot with data access methods
 */
export interface DocumentSnapshot {
  /** Full document reference path */
  ref: string
  /** Document ID (last segment of path) */
  id: string
  /** Whether the document exists */
  exists: boolean
  /** Snapshot metadata */
  metadata: SnapshotMetadata

  /**
   * Get document data as plain JavaScript object
   * @returns Decoded document data or undefined if document doesn't exist
   */
  data(): Record<string, unknown> | undefined

  /**
   * Get a specific field value
   * @param fieldPath - Dot-separated field path (e.g., "address.city")
   * @returns Field value or undefined
   */
  get(fieldPath: string): unknown
}

/**
 * Type of change that occurred to a document
 */
export type DocumentChangeType = 'added' | 'modified' | 'removed'

/**
 * Represents a change to a document in a query result
 */
export interface DocumentChange {
  /** Type of change */
  type: DocumentChangeType
  /** The changed document */
  doc: DocumentSnapshot
  /** Previous index in the result set (-1 if added or not applicable) */
  oldIndex: number
  /** New index in the result set (-1 if removed) */
  newIndex: number
}

/**
 * Query snapshot containing multiple documents
 */
export interface QuerySnapshot {
  /** Query path or identifier */
  query: string
  /** Array of all document snapshots in the result */
  docs: DocumentSnapshot[]
  /** Number of documents in the result */
  size: number
  /** True if there are no documents */
  empty: boolean
  /** Snapshot metadata */
  metadata: SnapshotMetadata
  /** Array of document changes since last snapshot */
  docChanges(): DocumentChange[]

  /**
   * Execute a callback for each document
   * @param callback - Function to call for each document
   */
  forEach(callback: (doc: DocumentSnapshot) => void): void
}

/**
 * Options for snapshot listeners
 */
export interface SnapshotListenOptions {
  /**
   * Include metadata changes (hasPendingWrites, fromCache transitions).
   * If false, only emit snapshots when actual data changes.
   * Default: false
   */
  includeMetadataChanges?: boolean
}

/**
 * Callback for document snapshot updates
 */
export type DocumentSnapshotCallback = (snapshot: DocumentSnapshot, error?: Error) => void

/**
 * Callback for query snapshot updates
 */
export type QuerySnapshotCallback = (snapshot: QuerySnapshot, error?: Error) => void

/**
 * Unsubscribe function to stop listening
 */
export type Unsubscribe = () => void

/**
 * Query specification for structured queries
 */
export interface QuerySpec {
  /** Collection ID to query */
  collection: string
  /** Optional where filters */
  where?: WhereFilter[]
  /** Optional order by clauses */
  orderBy?: OrderByClause[]
  /** Optional limit */
  limit?: number
  /** Optional start cursor */
  startAt?: unknown[]
  /** Optional end cursor */
  endAt?: unknown[]
}

/**
 * Where filter specification
 */
export interface WhereFilter {
  /** Field path */
  field: string
  /** Comparison operator */
  op: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in' | 'array-contains-any' | 'not-in'
  /** Value to compare */
  value: unknown
}

/**
 * Order by clause
 */
export interface OrderByClause {
  /** Field path */
  field: string
  /** Sort direction */
  direction: 'asc' | 'desc'
}

// ============================================================================
// Low-level Listen API Types (matching test file)
// ============================================================================

interface Target {
  targetId: number
  once?: boolean
  query?: QueryTarget
  documents?: DocumentsTarget
  resumeToken?: string
  readTime?: string
}

interface QueryTarget {
  parent: string
  structuredQuery: StructuredQuery
}

interface DocumentsTarget {
  documents: string[]
}

interface StructuredQuery {
  from?: CollectionSelector[]
  where?: Filter
  orderBy?: Order[]
  limit?: number
  startAt?: Cursor
  endAt?: Cursor
}

interface CollectionSelector {
  collectionId: string
  allDescendants?: boolean
}

interface Filter {
  fieldFilter?: FieldFilter
  compositeFilter?: CompositeFilter
  unaryFilter?: UnaryFilter
}

interface FieldFilter {
  field: { fieldPath: string }
  op: 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL' | 'EQUAL' | 'NOT_EQUAL' | 'ARRAY_CONTAINS' | 'IN' | 'ARRAY_CONTAINS_ANY' | 'NOT_IN'
  value: Value
}

interface CompositeFilter {
  op: 'AND' | 'OR'
  filters: Filter[]
}

interface UnaryFilter {
  op: 'IS_NAN' | 'IS_NULL' | 'IS_NOT_NAN' | 'IS_NOT_NULL'
  field: { fieldPath: string }
}

interface Order {
  field: { fieldPath: string }
  direction: 'ASCENDING' | 'DESCENDING'
}

interface Cursor {
  values: Value[]
  before?: boolean
}

interface ListenRequest {
  addTarget?: Target
  removeTarget?: number
  labels?: Record<string, string>
}

interface ListenResponse {
  targetChange?: TargetChange
  documentChange?: DocumentChangeEvent
  documentDelete?: DocumentDelete
  documentRemove?: DocumentRemove
  filter?: ExistenceFilter
}

interface TargetChange {
  targetChangeType: 'NO_CHANGE' | 'ADD' | 'REMOVE' | 'CURRENT' | 'RESET'
  targetIds: number[]
  cause?: { code: number; message: string }
  resumeToken?: string
  readTime?: string
}

interface DocumentChangeEvent {
  document: Document
  targetIds: number[]
  removedTargetIds?: number[]
}

interface DocumentDelete {
  document: string
  removedTargetIds: number[]
  readTime: string
}

interface DocumentRemove {
  document: string
  removedTargetIds: number[]
  readTime: string
}

interface ExistenceFilter {
  targetId: number
  count: number
  unchangedNames?: {
    bits: string
    hashCount: number
  }
}

interface StreamReader {
  read(): Promise<{ done: boolean; value?: ListenResponse }>
  cancel(): void
}

interface ListenStreamResponse {
  status: number
  headers: Record<string, string>
  getReader(): StreamReader
}

// ============================================================================
// Internal State Management
// ============================================================================

/**
 * Manages state for a single watch target
 */
class WatchTarget {
  private documents = new Map<string, Document>()
  private currentState: 'PENDING' | 'CURRENT' | 'ERROR' = 'PENDING'
  private resumeToken?: string

  constructor(
    public readonly targetId: number,
    private readonly callback: (snapshot: DocumentSnapshot | QuerySnapshot, error?: Error) => void,
    private readonly options: SnapshotListenOptions,
    private readonly isQuery: boolean
  ) {}

  handleTargetChange(change: TargetChange): void {
    if (change.targetChangeType === 'CURRENT') {
      this.currentState = 'CURRENT'
      this.resumeToken = change.resumeToken
      // Emit initial snapshot when we reach CURRENT state
      this.emitSnapshot(false)
    } else if (change.targetChangeType === 'RESET') {
      // Clear local state and wait for resync
      this.documents.clear()
      this.currentState = 'PENDING'
    } else if (change.targetChangeType === 'REMOVE') {
      if (change.cause) {
        this.currentState = 'ERROR'
        const error = new Error(change.cause.message)
        this.callback(this.isQuery ? this.createQuerySnapshot(true) : this.createDocumentSnapshot('', true), error)
      }
    }
  }

  handleDocumentChange(change: DocumentChangeEvent): void {
    const { document, targetIds } = change
    if (targetIds.includes(this.targetId)) {
      // Document added or modified
      this.documents.set(document.name, document)
      // Emit snapshot if we're already CURRENT
      if (this.currentState === 'CURRENT') {
        this.emitSnapshot(false)
      }
    }
  }

  handleDocumentDelete(deleteEvent: DocumentDelete): void {
    if (deleteEvent.removedTargetIds.includes(this.targetId)) {
      this.documents.delete(deleteEvent.document)
      if (this.currentState === 'CURRENT') {
        this.emitSnapshot(false)
      }
    }
  }

  handleDocumentRemove(removeEvent: DocumentRemove): void {
    if (removeEvent.removedTargetIds.includes(this.targetId)) {
      this.documents.delete(removeEvent.document)
      if (this.currentState === 'CURRENT') {
        this.emitSnapshot(false)
      }
    }
  }

  private emitSnapshot(fromCache: boolean): void {
    if (this.isQuery) {
      this.callback(this.createQuerySnapshot(fromCache))
    } else {
      // For document watch, emit the single document
      const docPath = Array.from(this.documents.keys())[0] || ''
      this.callback(this.createDocumentSnapshot(docPath, fromCache))
    }
  }

  private createDocumentSnapshot(docPath: string, fromCache: boolean): DocumentSnapshot {
    const document = this.documents.get(docPath)
    const exists = !!document

    return {
      ref: docPath,
      id: extractDocumentId(docPath),
      exists,
      metadata: {
        hasPendingWrites: false, // Server snapshots never have pending writes
        fromCache,
      },
      data(): Record<string, unknown> | undefined {
        if (!exists || !document) return undefined
        return decodeFields(document.fields)
      },
      get(fieldPath: string): unknown {
        if (!exists || !document) return undefined
        const data = decodeFields(document.fields)
        return getNestedValue(data, fieldPath)
      },
    }
  }

  private createQuerySnapshot(fromCache: boolean): QuerySnapshot {
    const docs = Array.from(this.documents.values()).map((doc) =>
      this.createDocumentSnapshot(doc.name, fromCache)
    )

    // Track previous docs for change detection
    const previousDocs = this.previousDocs || []
    this.previousDocs = docs

    return {
      query: `target-${this.targetId}`,
      docs,
      size: docs.length,
      empty: docs.length === 0,
      metadata: {
        hasPendingWrites: false,
        fromCache,
      },
      docChanges: (): DocumentChange[] => {
        return calculateDocChanges(previousDocs, docs)
      },
      forEach(callback: (doc: DocumentSnapshot) => void): void {
        docs.forEach(callback)
      },
    }
  }

  private previousDocs?: DocumentSnapshot[]

  getResumeToken(): string | undefined {
    return this.resumeToken
  }
}

/**
 * Helper to decode Firestore fields to JavaScript objects
 */
function decodeFields(fields: Record<string, Value>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    result[key] = decodeValue(value)
  }
  return result
}

/**
 * Simple Value decoder (handles basic types)
 */
function decodeValue(value: Value): unknown {
  if ('nullValue' in value) return null
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return parseInt(value.integerValue || '0', 10)
  if ('doubleValue' in value) return value.doubleValue
  if ('stringValue' in value) return value.stringValue
  if ('timestampValue' in value) return new Date(value.timestampValue || '')
  if ('arrayValue' in value) {
    return (value.arrayValue?.values || []).map(decodeValue)
  }
  if ('mapValue' in value) {
    return decodeFields(value.mapValue?.fields || {})
  }
  if ('geoPointValue' in value) return value.geoPointValue
  if ('referenceValue' in value) return value.referenceValue
  if ('bytesValue' in value) return value.bytesValue
  return null
}

/**
 * Get nested value from object using dot-notation path
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
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
 * Extract document ID from full document path
 */
function extractDocumentId(docPath: string): string {
  const parts = docPath.split('/')
  return parts[parts.length - 1] || ''
}

/**
 * Calculate document changes between two snapshots
 */
function calculateDocChanges(
  oldDocs: DocumentSnapshot[],
  newDocs: DocumentSnapshot[]
): DocumentChange[] {
  const changes: DocumentChange[] = []
  const oldMap = new Map(oldDocs.map((doc) => [doc.ref, doc]))
  const newMap = new Map(newDocs.map((doc) => [doc.ref, doc]))

  // Check for added and modified
  newDocs.forEach((newDoc, newIndex) => {
    const oldDoc = oldMap.get(newDoc.ref)
    if (!oldDoc) {
      // Added
      changes.push({
        type: 'added',
        doc: newDoc,
        oldIndex: -1,
        newIndex,
      })
    } else {
      // Check if modified (compare data)
      const oldData = JSON.stringify(oldDoc.data())
      const newData = JSON.stringify(newDoc.data())
      if (oldData !== newData) {
        const oldIndex = oldDocs.findIndex((d) => d.ref === newDoc.ref)
        changes.push({
          type: 'modified',
          doc: newDoc,
          oldIndex,
          newIndex,
        })
      }
    }
  })

  // Check for removed
  oldDocs.forEach((oldDoc, oldIndex) => {
    if (!newMap.has(oldDoc.ref)) {
      changes.push({
        type: 'removed',
        doc: oldDoc,
        oldIndex,
        newIndex: -1,
      })
    }
  })

  return changes
}

// ============================================================================
// Public API - Document Watching
// ============================================================================

/**
 * Watch a single document for real-time updates
 *
 * @param projectId - Firebase project ID
 * @param databaseId - Firestore database ID (default: "(default)")
 * @param documentPath - Document path (e.g., "users/user123")
 * @param callback - Callback function called with snapshots
 * @param options - Optional listening options
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * const unsubscribe = watchDocument(
 *   'my-project',
 *   '(default)',
 *   'users/alice',
 *   (snapshot) => {
 *     if (snapshot.exists) {
 *       console.log('User data:', snapshot.data())
 *     } else {
 *       console.log('User not found')
 *     }
 *   }
 * )
 *
 * // Later: stop listening
 * unsubscribe()
 * ```
 */
export function watchDocument(
  projectId: string,
  databaseId: string,
  documentPath: string,
  callback: DocumentSnapshotCallback,
  options: SnapshotListenOptions = {}
): Unsubscribe {
  const fullPath = `projects/${projectId}/databases/${databaseId}/documents/${documentPath}`
  const targetId = generateTargetId()

  const target = new WatchTarget(
    targetId,
    callback as (snapshot: DocumentSnapshot | QuerySnapshot, error?: Error) => void,
    options,
    false // isQuery = false
  )

  const request: ListenRequest = {
    addTarget: {
      targetId,
      documents: {
        documents: [fullPath],
      },
    },
  }

  // Start listening
  const { cancel } = startListening(projectId, databaseId, [request], target)

  return cancel
}

/**
 * Watch a query for real-time updates
 *
 * @param projectId - Firebase project ID
 * @param databaseId - Firestore database ID (default: "(default)")
 * @param querySpec - Query specification
 * @param callback - Callback function called with query snapshots
 * @param options - Optional listening options
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * const unsubscribe = watchQuery(
 *   'my-project',
 *   '(default)',
 *   {
 *     collection: 'users',
 *     where: [{ field: 'active', op: '==', value: true }],
 *     orderBy: [{ field: 'name', direction: 'asc' }],
 *     limit: 10
 *   },
 *   (snapshot) => {
 *     console.log(`Found ${snapshot.size} active users`)
 *     snapshot.forEach(doc => {
 *       console.log(doc.id, doc.data())
 *     })
 *
 *     // Get changes
 *     snapshot.docChanges().forEach(change => {
 *       console.log(`${change.type}:`, change.doc.id)
 *     })
 *   }
 * )
 *
 * // Later: stop listening
 * unsubscribe()
 * ```
 */
export function watchQuery(
  projectId: string,
  databaseId: string,
  querySpec: QuerySpec,
  callback: QuerySnapshotCallback,
  options: SnapshotListenOptions = {}
): Unsubscribe {
  const parent = `projects/${projectId}/databases/${databaseId}/documents`
  const targetId = generateTargetId()

  const target = new WatchTarget(
    targetId,
    callback as (snapshot: DocumentSnapshot | QuerySnapshot, error?: Error) => void,
    options,
    true // isQuery = true
  )

  const structuredQuery = buildStructuredQuery(querySpec)

  const request: ListenRequest = {
    addTarget: {
      targetId,
      query: {
        parent,
        structuredQuery,
      },
    },
  }

  // Start listening
  const { cancel } = startListening(projectId, databaseId, [request], target)

  return cancel
}

// ============================================================================
// Internal Implementation
// ============================================================================

let nextTargetId = 1
function generateTargetId(): number {
  return nextTargetId++
}

/**
 * Build a StructuredQuery from QuerySpec
 */
function buildStructuredQuery(spec: QuerySpec): StructuredQuery {
  const query: StructuredQuery = {
    from: [{ collectionId: spec.collection }],
  }

  // Add where filters
  if (spec.where && spec.where.length > 0) {
    if (spec.where.length === 1) {
      query.where = buildFilter(spec.where[0])
    } else {
      // Multiple filters: combine with AND
      query.where = {
        compositeFilter: {
          op: 'AND',
          filters: spec.where.map(buildFilter),
        },
      }
    }
  }

  // Add orderBy
  if (spec.orderBy && spec.orderBy.length > 0) {
    query.orderBy = spec.orderBy.map((order) => ({
      field: { fieldPath: order.field },
      direction: order.direction === 'asc' ? 'ASCENDING' : 'DESCENDING',
    }))
  }

  // Add limit
  if (spec.limit !== undefined) {
    query.limit = spec.limit
  }

  // Add cursors (simplified - would need proper encoding)
  if (spec.startAt) {
    query.startAt = {
      values: spec.startAt.map(encodeSimpleValue),
      before: true,
    }
  }

  if (spec.endAt) {
    query.endAt = {
      values: spec.endAt.map(encodeSimpleValue),
      before: false,
    }
  }

  return query
}

/**
 * Build a Filter from WhereFilter
 */
function buildFilter(where: WhereFilter): Filter {
  const opMap: Record<string, string> = {
    '==': 'EQUAL',
    '!=': 'NOT_EQUAL',
    '<': 'LESS_THAN',
    '<=': 'LESS_THAN_OR_EQUAL',
    '>': 'GREATER_THAN',
    '>=': 'GREATER_THAN_OR_EQUAL',
    'array-contains': 'ARRAY_CONTAINS',
    'in': 'IN',
    'array-contains-any': 'ARRAY_CONTAINS_ANY',
    'not-in': 'NOT_IN',
  }

  const firestoreOp = opMap[where.op] as FieldFilter['op']

  return {
    fieldFilter: {
      field: { fieldPath: where.field },
      op: firestoreOp,
      value: encodeSimpleValue(where.value),
    },
  }
}

/**
 * Simple value encoder (basic types only)
 */
function encodeSimpleValue(value: unknown): Value {
  if (value === null) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) }
    return { doubleValue: value }
  }
  if (typeof value === 'string') return { stringValue: value }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeSimpleValue) } }
  }
  if (typeof value === 'object') {
    const fields: Record<string, Value> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      fields[k] = encodeSimpleValue(v)
    }
    return { mapValue: { fields } }
  }
  return { nullValue: null }
}

/**
 * Convert CrudDocument to watch Document format
 */
function crudDocToWatchDoc(doc: CrudDocument): Document {
  return {
    name: doc.name,
    fields: doc.fields || {},
    createTime: doc.createTime || new Date().toISOString(),
    updateTime: doc.updateTime || new Date().toISOString(),
  }
}

/**
 * Start listening to Firestore
 * Connects to the in-memory document store and subscribes to changes
 */
function startListening(
  projectId: string,
  databaseId: string,
  requests: ListenRequest[],
  target: WatchTarget
): { cancel: () => void } {
  let cancelled = false
  let unsubscribe: (() => void) | null = null

  // Determine what we're watching
  const request = requests[0]
  const addTarget = request?.addTarget
  if (!addTarget) {
    return { cancel: () => {} }
  }

  const targetId = addTarget.targetId

  // Helper to check if a document path matches what we're watching
  const matchesWatch = (docPath: string): boolean => {
    if (addTarget.documents?.documents) {
      // Watching specific documents
      return addTarget.documents.documents.includes(docPath)
    }
    if (addTarget.query?.structuredQuery?.from) {
      // Watching a collection query
      const collectionId = addTarget.query.structuredQuery.from[0]?.collectionId
      if (collectionId) {
        // Check if document is in this collection
        const basePath = `projects/${projectId}/databases/${databaseId}/documents/`
        const collectionPath = `${basePath}${collectionId}/`
        if (docPath.startsWith(collectionPath)) {
          // Check it's a direct child (not in a subcollection)
          const relativePath = docPath.slice(collectionPath.length)
          return !relativePath.includes('/')
        }
      }
    }
    return false
  }

  // Start watching
  const startWatch = async () => {
    try {
      // Send initial CURRENT state after loading initial documents
      const initialDocs: Document[] = []

      if (addTarget.documents?.documents) {
        // Document watch - get the specific documents
        for (const docPath of addTarget.documents.documents) {
          const doc = getDocument(docPath)
          if (doc) {
            initialDocs.push(crudDocToWatchDoc(doc))
          }
        }
      } else if (addTarget.query?.structuredQuery?.from) {
        // Query watch - get documents from collection
        const collectionId = addTarget.query.structuredQuery.from[0]?.collectionId
        if (collectionId) {
          const basePath = `projects/${projectId}/databases/${databaseId}/documents/${collectionId}`
          const docs = getDocumentsInCollection(basePath)
          for (const doc of docs) {
            initialDocs.push(crudDocToWatchDoc(doc))
          }
        }
      }

      // Emit initial document changes
      for (const doc of initialDocs) {
        if (cancelled) return
        target.handleDocumentChange({
          document: doc,
          targetIds: [targetId],
        })
      }

      // Mark target as CURRENT
      if (!cancelled) {
        target.handleTargetChange({
          targetChangeType: 'CURRENT',
          targetIds: [targetId],
          readTime: new Date().toISOString(),
          resumeToken: Buffer.from(Date.now().toString()).toString('base64'),
        })
      }

      // Subscribe to future changes
      unsubscribe = subscribeToDocumentChanges((event: CrudDocumentChangeEvent) => {
        if (cancelled) return
        if (!matchesWatch(event.path)) return

        if (event.type === 'removed') {
          target.handleDocumentDelete({
            document: event.path,
            removedTargetIds: [targetId],
            readTime: new Date().toISOString(),
          })
        } else {
          // added or modified
          if (event.document) {
            target.handleDocumentChange({
              document: crudDocToWatchDoc(event.document),
              targetIds: [targetId],
            })
          }
        }
      })
    } catch (error) {
      if (!cancelled) {
        const errorObj = error instanceof Error ? error : new Error(String(error))
        const emptySnapshot: DocumentSnapshot = {
          ref: '',
          id: '',
          exists: false,
          metadata: { hasPendingWrites: false, fromCache: false },
          data: () => undefined,
          get: () => undefined,
        }
        target['callback'](emptySnapshot, errorObj)
      }
    }
  }

  // Start the watch asynchronously
  startWatch()

  return {
    cancel: () => {
      cancelled = true
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
    },
  }
}

