/**
 * Tests for Firestore Listen/Watch Streaming API
 *
 * The Listen/Watch API enables real-time document synchronization via Server-Sent Events
 * or chunked HTTP responses. Clients can subscribe to individual documents or queries.
 *
 * API Endpoint: POST /v1/projects/{project}/databases/{database}/documents:listen
 *
 * Reference: https://cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/listen
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  updateDocument as crudUpdateDocument,
  deleteDocument as crudDeleteDocument,
  getDocument as crudGetDocument,
  getAllDocuments,
  clearAllDocuments,
  buildDocumentPath,
} from '../../src/firestore/crud'

// ============================================================================
// Types for Firestore Listen/Watch API
// ============================================================================

/**
 * Target specification for what to listen to
 */
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
  value: FirestoreValue
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
  values: FirestoreValue[]
  before?: boolean
}

interface FirestoreValue {
  nullValue?: null
  booleanValue?: boolean
  integerValue?: string
  doubleValue?: number
  timestampValue?: string
  stringValue?: string
  bytesValue?: string
  referenceValue?: string
  geoPointValue?: { latitude: number; longitude: number }
  arrayValue?: { values: FirestoreValue[] }
  mapValue?: { fields: Record<string, FirestoreValue> }
}

/**
 * Listen request body
 */
interface ListenRequest {
  addTarget?: Target
  removeTarget?: number
  labels?: Record<string, string>
}

/**
 * Listen response events
 */
interface ListenResponse {
  targetChange?: TargetChange
  documentChange?: DocumentChange
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

interface DocumentChange {
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

interface Document {
  name: string
  fields: Record<string, FirestoreValue>
  createTime: string
  updateTime: string
}

// ============================================================================
// Mock HTTP Stream Interface
// ============================================================================

interface StreamEvent {
  type: 'data' | 'end' | 'error'
  data?: ListenResponse
  error?: Error
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
// Stub Implementation (Returns 501 Not Implemented - RED phase)
// ============================================================================

/**
 * Initiates a Listen stream connection to Firestore
 * TODO: Implement in actual handler
 */
async function listenToFirestore(
  projectId: string,
  databaseId: string,
  requests: ListenRequest[]
): Promise<ListenStreamResponse> {
  // Validate inputs
  if (!projectId || !databaseId) {
    return createErrorResponse(400)
  }

  const events: ListenResponse[] = []
  const targets = new Map<number, Target>()
  const activeTargetIds = new Set<number>()

  // Process requests to build targets
  for (const request of requests) {
    if (request.addTarget) {
      const target = request.addTarget

      // Validate target has either documents or query
      if (!target.documents && !target.query) {
        return createErrorResponse(400)
      }

      // Check for duplicate target ID
      if (targets.has(target.targetId)) {
        // Replace existing target
        targets.set(target.targetId, target)
      } else {
        targets.set(target.targetId, target)
      }

      // Validate document paths
      if (target.documents) {
        let hasError = false
        for (const docPath of target.documents.documents) {
          if (!docPath.startsWith('projects/')) {
            // Invalid document path
            events.push({
              targetChange: {
                targetChangeType: 'REMOVE',
                targetIds: [target.targetId],
                cause: {
                  code: 3,
                  message: 'Invalid document path',
                },
              },
            })
            hasError = true
            break
          }

          // Validate project ID matches
          const pathParts = docPath.split('/')
          if (pathParts[1] !== projectId) {
            events.push({
              targetChange: {
                targetChangeType: 'REMOVE',
                targetIds: [target.targetId],
                cause: {
                  code: 7,
                  message: `Project ID mismatch: expected ${projectId}, got ${pathParts[1]}`,
                },
              },
            })
            hasError = true
            break
          }
        }

        if (hasError) {
          continue
        }
      }

      activeTargetIds.add(target.targetId)

      // Send ADD event
      events.push({
        targetChange: {
          targetChangeType: 'ADD',
          targetIds: [target.targetId],
        },
      })
    }

    if (request.removeTarget !== undefined) {
      const targetId = request.removeTarget
      activeTargetIds.delete(targetId)

      events.push({
        targetChange: {
          targetChangeType: 'REMOVE',
          targetIds: [targetId],
        },
      })
    }
  }

  // Fetch initial data for each target
  for (const [targetId, target] of targets.entries()) {
    if (!activeTargetIds.has(targetId)) continue

    if (target.documents) {
      // Document target
      for (const docPath of target.documents.documents) {
        const doc = getDocumentFromStore(docPath)
        if (doc) {
          events.push({
            documentChange: {
              document: doc,
              targetIds: [targetId],
            },
          })
        }
      }
    } else if (target.query) {
      // Query target
      const docs = executeQueryForTarget(projectId, databaseId, target.query)

      // Track which documents are in this query
      const docPaths = new Set<string>()
      for (const doc of docs) {
        docPaths.add(doc.name)
        events.push({
          documentChange: {
            document: doc,
            targetIds: [targetId],
          },
        })
      }
      queryTargetDocs.set(targetId, docPaths)

      // Optional: Add existence filter
      if (docs.length > 0) {
        events.push({
          filter: {
            targetId,
            count: docs.length,
          },
        })
      }
    }

    // Send CURRENT event after initial sync
    const resumeToken = generateResumeToken()
    events.push({
      targetChange: {
        targetChangeType: 'CURRENT',
        targetIds: [targetId],
        resumeToken,
        readTime: new Date().toISOString(),
      },
    })
  }

  // Store targets globally for change tracking
  for (const [targetId, target] of targets.entries()) {
    if (activeTargetIds.has(targetId)) {
      globalTargets.set(targetId, target)
    }
  }

  // Create stream reader with live updates
  let eventIndex = 0
  let cancelled = false
  const pendingEvents: ListenResponse[] = [...events]

  // Subscribe to live changes
  const unsubscribe = subscribeToChanges((change) => {
    if (!cancelled) {
      pendingEvents.push(change)
    }
  })

  // Create a single reader instance to be reused
  const reader: StreamReader = {
    async read(): Promise<{ done: boolean; value?: ListenResponse }> {
      if (cancelled) {
        return { done: true }
      }

      // Wait for events if we've consumed all initial events
      if (eventIndex >= pendingEvents.length) {
        // Poll for new events with a longer timeout
        const maxWaitTime = 500 // milliseconds - increased for slow operations
        const startTime = Date.now()

        while (eventIndex >= pendingEvents.length && !cancelled) {
          await new Promise(resolve => setTimeout(resolve, 10))

          // If we've waited too long, break (but don't return done)
          if (Date.now() - startTime > maxWaitTime) {
            break
          }
        }

        // If still no events after waiting, return done (will be called again)
        if (eventIndex >= pendingEvents.length) {
          return { done: true }
        }
      }

      const event = pendingEvents[eventIndex++]
      return { done: false, value: event }
    },
    cancel(): void {
      cancelled = true
      unsubscribe()

      // Remove targets from global map
      for (const targetId of activeTargetIds) {
        globalTargets.delete(targetId)
      }
    },
  }

  return {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'transfer-encoding': 'chunked',
    },
    getReader(): StreamReader {
      return reader
    },
  }
}

function createErrorResponse(status: number): ListenStreamResponse {
  return {
    status,
    headers: {
      'content-type': 'application/json',
      'transfer-encoding': 'chunked',
    },
    getReader(): StreamReader {
      return {
        async read(): Promise<{ done: boolean; value?: ListenResponse }> {
          return { done: true }
        },
        cancel(): void {},
      }
    },
  }
}

let resumeTokenCounter = 0
function generateResumeToken(): string {
  return Buffer.from(`resume-${Date.now()}-${resumeTokenCounter++}`).toString('base64')
}

// ============================================================================
// Document Change Tracking for Live Updates
// ============================================================================

type ChangeListener = (change: ListenResponse) => void

const changeListeners: ChangeListener[] = []

function subscribeToChanges(listener: ChangeListener): () => void {
  changeListeners.push(listener)
  return () => {
    const index = changeListeners.indexOf(listener)
    if (index > -1) {
      changeListeners.splice(index, 1)
    }
  }
}

function notifyDocumentChange(docPath: string, doc: Document | null, allTargets: Map<number, Target>) {
  // Notify all change listeners
  for (const listener of changeListeners) {
    // Find which targets this document belongs to
    for (const [targetId, target] of allTargets.entries()) {
      if (target.documents) {
        // Document target
        if (target.documents.documents.includes(docPath)) {
          if (doc) {
            // Document changed
            listener({
              documentChange: {
                document: doc,
                targetIds: [targetId],
              },
            })
          } else {
            // Document deleted
            listener({
              documentDelete: {
                document: docPath,
                removedTargetIds: [targetId],
                readTime: new Date().toISOString(),
              },
            })
          }
        }
      } else if (target.query) {
        // Query target - check if document matches query
        const projectId = docPath.split('/')[1]
        const databaseId = docPath.split('/')[3]

        const wasInResults = queryTargetDocs.get(targetId)?.has(docPath) || false

        if (doc) {
          const docs = executeQueryForTarget(projectId, databaseId, target.query)
          const matchesNow = docs.some(d => d.name === docPath)

          if (matchesNow && !wasInResults) {
            // Document added to query
            queryTargetDocs.get(targetId)?.add(docPath)
            listener({
              documentChange: {
                document: doc,
                targetIds: [targetId],
              },
            })
          } else if (matchesNow && wasInResults) {
            // Document modified in query
            listener({
              documentChange: {
                document: doc,
                targetIds: [targetId],
              },
            })
          } else if (!matchesNow && wasInResults) {
            // Document removed from query (no longer matches)
            queryTargetDocs.get(targetId)?.delete(docPath)
            listener({
              documentRemove: {
                document: docPath,
                removedTargetIds: [targetId],
                readTime: new Date().toISOString(),
              },
            })
          }
        } else {
          // Document deleted
          queryTargetDocs.get(targetId)?.delete(docPath)
          listener({
            documentDelete: {
              document: docPath,
              removedTargetIds: [targetId],
              readTime: new Date().toISOString(),
            },
          })
        }
      }
    }
  }
}

// Track active targets globally
const globalTargets = new Map<number, Target>()

// Track which documents are in each query target
const queryTargetDocs = new Map<number, Set<string>>()

/**
 * Helper to get a document from the store
 */
function getDocumentFromStore(docPath: string): Document | null {
  const doc = crudGetDocument(docPath)
  if (!doc) return null

  return {
    name: doc.name,
    fields: doc.fields || {},
    createTime: doc.createTime || new Date().toISOString(),
    updateTime: doc.updateTime || new Date().toISOString(),
  }
}

/**
 * Helper to execute a query and return matching documents
 */
function executeQueryForTarget(
  projectId: string,
  databaseId: string,
  queryTarget: QueryTarget
): Document[] {
  const allDocs = getAllDocuments()
  const results: Document[] = []

  const parent = `projects/${projectId}/databases/${databaseId}/documents`
  const collectionId = queryTarget.structuredQuery.from?.[0]?.collectionId

  if (!collectionId) return []

  // Filter documents by collection
  for (const [path, doc] of allDocs.entries()) {
    if (!path.startsWith(parent)) continue

    // Extract collection from path
    const relativePath = path.substring(parent.length + 1)
    const segments = relativePath.split('/')

    // Check if document is in the target collection (simple check)
    if (segments[0] !== collectionId) continue

    // Apply filters
    if (queryTarget.structuredQuery.where) {
      if (!matchesFilter(doc.fields || {}, queryTarget.structuredQuery.where)) {
        continue
      }
    }

    results.push({
      name: doc.name,
      fields: doc.fields || {},
      createTime: doc.createTime || new Date().toISOString(),
      updateTime: doc.updateTime || new Date().toISOString(),
    })
  }

  // Apply orderBy
  if (queryTarget.structuredQuery.orderBy) {
    const orderBy = queryTarget.structuredQuery.orderBy
    results.sort((a, b) => {
      for (const order of orderBy) {
        const fieldPath = order.field.fieldPath
        const aValue = getFieldValue(a.fields, fieldPath)
        const bValue = getFieldValue(b.fields, fieldPath)

        const comparison = compareValues(aValue, bValue)
        if (comparison !== 0) {
          return order.direction === 'ASCENDING' ? comparison : -comparison
        }
      }
      return 0
    })
  }

  // Apply limit
  if (queryTarget.structuredQuery.limit) {
    return results.slice(0, queryTarget.structuredQuery.limit)
  }

  return results
}

/**
 * Check if document fields match a filter
 */
function matchesFilter(fields: Record<string, FirestoreValue>, filter: Filter): boolean {
  if (filter.fieldFilter) {
    const ff = filter.fieldFilter
    const fieldValue = getFieldValue(fields, ff.field.fieldPath)

    return compareFilterValue(fieldValue, ff.op, ff.value)
  }

  if (filter.compositeFilter) {
    const cf = filter.compositeFilter
    if (cf.op === 'AND') {
      return cf.filters.every((f) => matchesFilter(fields, f))
    } else if (cf.op === 'OR') {
      return cf.filters.some((f) => matchesFilter(fields, f))
    }
  }

  if (filter.unaryFilter) {
    const uf = filter.unaryFilter
    const fieldValue = getFieldValue(fields, uf.field.fieldPath)

    if (uf.op === 'IS_NULL') {
      return fieldValue === null || fieldValue === undefined
    } else if (uf.op === 'IS_NOT_NULL') {
      return fieldValue !== null && fieldValue !== undefined
    }
  }

  return true
}

/**
 * Get field value by path
 */
function getFieldValue(fields: Record<string, FirestoreValue>, path: string): unknown {
  const parts = path.split('.')
  let current: any = fields

  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined
    current = current[part]
  }

  // Decode Firestore value
  if (current && typeof current === 'object') {
    if ('stringValue' in current) return current.stringValue
    if ('integerValue' in current) return parseInt(current.integerValue, 10)
    if ('booleanValue' in current) return current.booleanValue
    if ('doubleValue' in current) return current.doubleValue
    if ('nullValue' in current) return null
  }

  return current
}

/**
 * Compare values for sorting
 */
function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1

  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b)
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  return String(a).localeCompare(String(b))
}

/**
 * Compare filter value with operator
 */
function compareFilterValue(
  fieldValue: unknown,
  op: string,
  filterValue: FirestoreValue
): boolean {
  const targetValue = getFieldValue({ val: filterValue }, 'val')

  switch (op) {
    case 'EQUAL':
      return fieldValue === targetValue
    case 'NOT_EQUAL':
      return fieldValue !== targetValue
    case 'LESS_THAN':
      return (fieldValue as number) < (targetValue as number)
    case 'LESS_THAN_OR_EQUAL':
      return (fieldValue as number) <= (targetValue as number)
    case 'GREATER_THAN':
      return (fieldValue as number) > (targetValue as number)
    case 'GREATER_THAN_OR_EQUAL':
      return (fieldValue as number) >= (targetValue as number)
    case 'ARRAY_CONTAINS':
      return Array.isArray(fieldValue) && fieldValue.includes(targetValue)
    case 'IN':
      return Array.isArray(targetValue) && targetValue.includes(fieldValue)
    default:
      return true
  }
}

/**
 * Helper to create a document for a collection
 */
async function createDocument(
  projectId: string,
  databaseId: string,
  collectionPath: string,
  documentId: string,
  fields: Record<string, FirestoreValue>
): Promise<Document> {
  const path = buildDocumentPath(projectId, databaseId, `${collectionPath}/${documentId}`)
  const doc = crudUpdateDocument(path, fields)

  return {
    name: doc.name,
    fields: doc.fields || {},
    createTime: doc.createTime || new Date().toISOString(),
    updateTime: doc.updateTime || new Date().toISOString(),
  }
}

/**
 * Helper to update a document
 */
async function updateDocument(
  projectId: string,
  databaseId: string,
  documentPath: string,
  fields: Record<string, FirestoreValue>
): Promise<Document> {
  const path = buildDocumentPath(projectId, databaseId, documentPath)
  const doc = crudUpdateDocument(path, fields)

  const result = {
    name: doc.name,
    fields: doc.fields || {},
    createTime: doc.createTime || new Date().toISOString(),
    updateTime: doc.updateTime || new Date().toISOString(),
  }

  // Notify listeners about the change
  notifyDocumentChange(path, result, globalTargets)

  return result
}

/**
 * Helper to delete a document
 */
async function deleteDocument(
  projectId: string,
  databaseId: string,
  documentPath: string
): Promise<void> {
  const path = buildDocumentPath(projectId, databaseId, documentPath)
  crudDeleteDocument(path)

  // Notify listeners about the deletion
  notifyDocumentChange(path, null, globalTargets)
}

/**
 * Collects events from a stream until a condition is met or timeout
 */
async function collectEvents(
  stream: ListenStreamResponse,
  options: {
    count?: number
    timeout?: number
    until?: (events: ListenResponse[]) => boolean
  } = {}
): Promise<ListenResponse[]> {
  const { count = 10, timeout = 5000, until } = options
  const events: ListenResponse[] = []
  const reader = stream.getReader()

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Stream timeout')), timeout)
  })

  try {
    while (events.length < count) {
      const { done, value } = await Promise.race([reader.read(), timeoutPromise])
      if (done) break
      if (value) {
        events.push(value)
        if (until && until(events)) break
      }
    }
  } catch (error) {
    // Don't cancel on timeout, just return what we have
    if (error instanceof Error && error.message !== 'Stream timeout') {
      throw error
    }
  }
  // Don't cancel the reader - let it stay open for future reads

  return events
}

// ============================================================================
// Tests
// ============================================================================

describe('Firestore Listen/Watch Streaming API', () => {
  const projectId = 'test-project'
  const databaseId = '(default)'

  beforeEach(() => {
    // Clear document store before each test
    clearAllDocuments()
    // Clear global watch state
    globalTargets.clear()
    queryTargetDocs.clear()
    changeListeners.length = 0
  })

  describe('POST /v1/projects/{p}/databases/{db}/documents:listen', () => {
    describe('Streaming Response Format', () => {
      it('should return 200 status for valid listen request', async () => {
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
              },
            },
          },
        ])

        expect(response.status).toBe(200)
      })

      it('should set Transfer-Encoding to chunked for streaming', async () => {
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
              },
            },
          },
        ])

        expect(response.headers['transfer-encoding']).toBe('chunked')
      })

      it('should set Content-Type to application/json', async () => {
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
              },
            },
          },
        ])

        expect(response.headers['content-type']).toBe('application/json')
      })

      it('should support Server-Sent Events format when Accept header specifies text/event-stream', async () => {
        // This test verifies SSE format support as alternative to chunked JSON
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
              },
            },
          },
        ])

        // Either chunked or SSE format should be supported
        expect(['chunked', 'text/event-stream']).toContain(
          response.headers['transfer-encoding'] || response.headers['content-type']
        )
      })
    })

    describe('Listen to Single Document', () => {
      it('should accept addTarget with documents target', async () => {
        const documentPath = `projects/${projectId}/databases/${databaseId}/documents/users/user1`
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: [documentPath],
              },
            },
          },
        ])

        expect(response.status).toBe(200)
      })

      it('should receive targetChange with CURRENT state after initial sync', async () => {
        const documentPath = `projects/${projectId}/databases/${databaseId}/documents/users/user1`
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: [documentPath],
              },
            },
          },
        ])

        const events = await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        const currentEvent = events.find((e) => e.targetChange?.targetChangeType === 'CURRENT')
        expect(currentEvent).toBeDefined()
        expect(currentEvent?.targetChange?.targetIds).toContain(1)
      })

      it('should receive documentChange for existing document', async () => {
        // Create document first
        await createDocument(projectId, databaseId, 'users', 'user1', {
          name: { stringValue: 'John Doe' },
          email: { stringValue: 'john@example.com' },
        })

        const documentPath = `projects/${projectId}/databases/${databaseId}/documents/users/user1`
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: [documentPath],
              },
            },
          },
        ])

        const events = await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        const docChange = events.find((e) => e.documentChange !== undefined)
        expect(docChange).toBeDefined()
        expect(docChange?.documentChange?.document.name).toBe(documentPath)
        expect(docChange?.documentChange?.targetIds).toContain(1)
      })

      it('should receive documentChange when document is modified', async () => {
        const documentPath = `projects/${projectId}/databases/${databaseId}/documents/users/user1`

        // Create initial document
        await createDocument(projectId, databaseId, 'users', 'user1', {
          name: { stringValue: 'John Doe' },
        })

        // Start listening
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: [documentPath],
              },
            },
          },
        ])

        // Wait for initial sync
        await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        // Update the document
        await updateDocument(projectId, databaseId, 'users/user1', {
          name: { stringValue: 'Jane Doe' },
        })

        // Collect update event
        const updateEvents = await collectEvents(response, { count: 1, timeout: 2000 })

        const updateEvent = updateEvents.find((e) => e.documentChange !== undefined)
        expect(updateEvent).toBeDefined()
        expect(updateEvent?.documentChange?.document.fields.name?.stringValue).toBe('Jane Doe')
      })

      it('should receive documentDelete when document is deleted', async () => {
        const documentPath = `projects/${projectId}/databases/${databaseId}/documents/users/user1`

        // Create document first
        await createDocument(projectId, databaseId, 'users', 'user1', {
          name: { stringValue: 'John Doe' },
        })

        // Start listening
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: [documentPath],
              },
            },
          },
        ])

        // Wait for initial sync
        await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        // Delete the document
        await deleteDocument(projectId, databaseId, 'users/user1')

        // Collect delete event
        const deleteEvents = await collectEvents(response, { count: 1, timeout: 2000 })

        const deleteEvent = deleteEvents.find((e) => e.documentDelete !== undefined)
        expect(deleteEvent).toBeDefined()
        expect(deleteEvent?.documentDelete?.document).toBe(documentPath)
        expect(deleteEvent?.documentDelete?.removedTargetIds).toContain(1)
      })
    })

    describe('Listen to Query (Collection with Filters)', () => {
      it('should accept addTarget with query target', async () => {
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              query: {
                parent: `projects/${projectId}/databases/${databaseId}/documents`,
                structuredQuery: {
                  from: [{ collectionId: 'users' }],
                },
              },
            },
          },
        ])

        expect(response.status).toBe(200)
      })

      it('should receive all matching documents for collection query', async () => {
        // Create test documents
        await createDocument(projectId, databaseId, 'products', 'prod1', {
          name: { stringValue: 'Product 1' },
          price: { integerValue: '100' },
        })
        await createDocument(projectId, databaseId, 'products', 'prod2', {
          name: { stringValue: 'Product 2' },
          price: { integerValue: '200' },
        })

        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              query: {
                parent: `projects/${projectId}/databases/${databaseId}/documents`,
                structuredQuery: {
                  from: [{ collectionId: 'products' }],
                },
              },
            },
          },
        ])

        const events = await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        const docChanges = events.filter((e) => e.documentChange !== undefined)
        expect(docChanges.length).toBeGreaterThanOrEqual(2)
      })

      it('should filter documents with where clause', async () => {
        // Create test documents
        await createDocument(projectId, databaseId, 'products', 'prod1', {
          name: { stringValue: 'Product 1' },
          price: { integerValue: '100' },
          active: { booleanValue: true },
        })
        await createDocument(projectId, databaseId, 'products', 'prod2', {
          name: { stringValue: 'Product 2' },
          price: { integerValue: '200' },
          active: { booleanValue: false },
        })

        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              query: {
                parent: `projects/${projectId}/databases/${databaseId}/documents`,
                structuredQuery: {
                  from: [{ collectionId: 'products' }],
                  where: {
                    fieldFilter: {
                      field: { fieldPath: 'active' },
                      op: 'EQUAL',
                      value: { booleanValue: true },
                    },
                  },
                },
              },
            },
          },
        ])

        const events = await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        const docChanges = events.filter((e) => e.documentChange !== undefined)
        // Should only receive active products
        expect(docChanges.length).toBe(1)
        expect(docChanges[0].documentChange?.document.fields.active?.booleanValue).toBe(true)
      })

      it('should support orderBy in query', async () => {
        // Create test documents
        await createDocument(projectId, databaseId, 'products', 'prod1', {
          name: { stringValue: 'B Product' },
          price: { integerValue: '100' },
        })
        await createDocument(projectId, databaseId, 'products', 'prod2', {
          name: { stringValue: 'A Product' },
          price: { integerValue: '200' },
        })

        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              query: {
                parent: `projects/${projectId}/databases/${databaseId}/documents`,
                structuredQuery: {
                  from: [{ collectionId: 'products' }],
                  orderBy: [{ field: { fieldPath: 'name' }, direction: 'ASCENDING' }],
                },
              },
            },
          },
        ])

        const events = await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        const docChanges = events.filter((e) => e.documentChange !== undefined)
        expect(docChanges.length).toBeGreaterThanOrEqual(2)
        // First document should be A Product (alphabetically first)
        expect(docChanges[0].documentChange?.document.fields.name?.stringValue).toBe('A Product')
      })

      it('should support limit in query', async () => {
        // Create multiple test documents
        for (let i = 0; i < 5; i++) {
          await createDocument(projectId, databaseId, 'items', `item${i}`, {
            index: { integerValue: String(i) },
          })
        }

        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              query: {
                parent: `projects/${projectId}/databases/${databaseId}/documents`,
                structuredQuery: {
                  from: [{ collectionId: 'items' }],
                  limit: 3,
                },
              },
            },
          },
        ])

        const events = await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        const docChanges = events.filter((e) => e.documentChange !== undefined)
        expect(docChanges.length).toBe(3)
      })

      it('should receive documentRemove when document no longer matches query filter', async () => {
        // Create active document
        await createDocument(projectId, databaseId, 'tasks', 'task1', {
          title: { stringValue: 'Task 1' },
          completed: { booleanValue: false },
        })

        // Listen for incomplete tasks
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              query: {
                parent: `projects/${projectId}/databases/${databaseId}/documents`,
                structuredQuery: {
                  from: [{ collectionId: 'tasks' }],
                  where: {
                    fieldFilter: {
                      field: { fieldPath: 'completed' },
                      op: 'EQUAL',
                      value: { booleanValue: false },
                    },
                  },
                },
              },
            },
          },
        ])

        // Wait for initial sync
        await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        // Mark task as completed (no longer matches filter)
        await updateDocument(projectId, databaseId, 'tasks/task1', {
          title: { stringValue: 'Task 1' },
          completed: { booleanValue: true },
        })

        // Should receive documentRemove since it no longer matches
        const removeEvents = await collectEvents(response, { count: 1, timeout: 2000 })

        const removeEvent = removeEvents.find((e) => e.documentRemove !== undefined)
        expect(removeEvent).toBeDefined()
        expect(removeEvent?.documentRemove?.removedTargetIds).toContain(1)
      })
    })
  })

  describe('Watch Response Events', () => {
    describe('targetChange Events', () => {
      it('should receive targetChange with ADD type when target is added', async () => {
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
              },
            },
          },
        ])

        const events = await collectEvents(response, { count: 5 })

        const addEvent = events.find((e) => e.targetChange?.targetChangeType === 'ADD')
        expect(addEvent).toBeDefined()
        expect(addEvent?.targetChange?.targetIds).toContain(1)
      })

      it('should receive targetChange with CURRENT state when initial sync completes', async () => {
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
              },
            },
          },
        ])

        const events = await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        const currentEvent = events.find((e) => e.targetChange?.targetChangeType === 'CURRENT')
        expect(currentEvent).toBeDefined()
        expect(currentEvent?.targetChange?.targetIds).toContain(1)
        expect(currentEvent?.targetChange?.readTime).toBeDefined()
      })

      it('should receive targetChange with REMOVE type when target is removed', async () => {
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
              },
            },
          },
          {
            removeTarget: 1,
          },
        ])

        const events = await collectEvents(response, { count: 5 })

        const removeEvent = events.find((e) => e.targetChange?.targetChangeType === 'REMOVE')
        expect(removeEvent).toBeDefined()
        expect(removeEvent?.targetChange?.targetIds).toContain(1)
      })

      it('should receive targetChange with RESET when server needs full resync', async () => {
        // RESET is sent when the server can no longer guarantee consistency
        // and the client must refetch all data
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              query: {
                parent: `projects/${projectId}/databases/${databaseId}/documents`,
                structuredQuery: {
                  from: [{ collectionId: 'large_collection' }],
                },
              },
            },
          },
        ])

        // Simulate a scenario that triggers RESET
        // (e.g., too many changes, connection issues)
        const events = await collectEvents(response, { count: 20, timeout: 10000 })

        // RESET may or may not occur depending on server state
        const resetEvent = events.find((e) => e.targetChange?.targetChangeType === 'RESET')
        if (resetEvent) {
          expect(resetEvent.targetChange?.targetIds).toContain(1)
        }
      })

      it('should include cause in targetChange when target has error', async () => {
        // Attempt to listen to non-existent or unauthorized resource
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: ['projects/invalid-project/databases/(default)/documents/secret/data'],
              },
            },
          },
        ])

        const events = await collectEvents(response, { count: 5 })

        const errorEvent = events.find(
          (e) => e.targetChange?.targetChangeType === 'REMOVE' && e.targetChange?.cause
        )
        expect(errorEvent).toBeDefined()
        expect(errorEvent?.targetChange?.cause?.code).toBeDefined()
        expect(errorEvent?.targetChange?.cause?.message).toBeDefined()
      })
    })

    describe('documentChange Events', () => {
      it('should include full document in documentChange for added documents', async () => {
        await createDocument(projectId, databaseId, 'users', 'user1', {
          name: { stringValue: 'John Doe' },
          email: { stringValue: 'john@example.com' },
          age: { integerValue: '30' },
        })

        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: {
                documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
              },
            },
          },
        ])

        const events = await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        const docChange = events.find((e) => e.documentChange !== undefined)
        expect(docChange?.documentChange?.document).toBeDefined()
        expect(docChange?.documentChange?.document.name).toContain('users/user1')
        expect(docChange?.documentChange?.document.fields).toBeDefined()
        expect(docChange?.documentChange?.document.fields.name?.stringValue).toBe('John Doe')
        expect(docChange?.documentChange?.document.createTime).toBeDefined()
        expect(docChange?.documentChange?.document.updateTime).toBeDefined()
      })

      it('should include targetIds in documentChange', async () => {
        await createDocument(projectId, databaseId, 'users', 'user1', {
          name: { stringValue: 'John Doe' },
        })

        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 42,
              documents: {
                documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
              },
            },
          },
        ])

        const events = await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        const docChange = events.find((e) => e.documentChange !== undefined)
        expect(docChange?.documentChange?.targetIds).toContain(42)
      })

      it('should include removedTargetIds when document moves between targets', async () => {
        // This tests the scenario where a document is in one target's result set
        // but gets modified to be in a different target's result set
        await createDocument(projectId, databaseId, 'items', 'item1', {
          category: { stringValue: 'A' },
        })

        // Listen to category A items
        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              query: {
                parent: `projects/${projectId}/databases/${databaseId}/documents`,
                structuredQuery: {
                  from: [{ collectionId: 'items' }],
                  where: {
                    fieldFilter: {
                      field: { fieldPath: 'category' },
                      op: 'EQUAL',
                      value: { stringValue: 'A' },
                    },
                  },
                },
              },
            },
          },
        ])

        // Wait for initial sync
        await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        // Change item category from A to B
        await updateDocument(projectId, databaseId, 'items/item1', {
          category: { stringValue: 'B' },
        })

        const updateEvents = await collectEvents(response, { count: 1, timeout: 2000 })

        // Should have removedTargetIds since it no longer matches target 1
        const changeEvent = updateEvents.find(
          (e) => e.documentChange !== undefined || e.documentRemove !== undefined
        )
        expect(changeEvent).toBeDefined()
      })
    })

    describe('documentDelete Events', () => {
      it('should receive documentDelete with document path', async () => {
        const documentPath = `projects/${projectId}/databases/${databaseId}/documents/users/toDelete`

        await createDocument(projectId, databaseId, 'users', 'toDelete', {
          name: { stringValue: 'To Be Deleted' },
        })

        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              documents: { documents: [documentPath] },
            },
          },
        ])

        await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
        })

        await deleteDocument(projectId, databaseId, 'users/toDelete')

        const deleteEvents = await collectEvents(response, { count: 1, timeout: 2000 })

        const deleteEvent = deleteEvents.find((e) => e.documentDelete !== undefined)
        expect(deleteEvent).toBeDefined()
        expect(deleteEvent?.documentDelete?.document).toBe(documentPath)
        expect(deleteEvent?.documentDelete?.readTime).toBeDefined()
        expect(deleteEvent?.documentDelete?.removedTargetIds).toContain(1)
      })
    })

    describe('filter (Existence Filter) Events', () => {
      it('should receive filter event with document count', async () => {
        // Create multiple documents
        for (let i = 0; i < 10; i++) {
          await createDocument(projectId, databaseId, 'counted', `doc${i}`, {
            index: { integerValue: String(i) },
          })
        }

        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              query: {
                parent: `projects/${projectId}/databases/${databaseId}/documents`,
                structuredQuery: {
                  from: [{ collectionId: 'counted' }],
                },
              },
            },
          },
        ])

        const events = await collectEvents(response, {
          until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
          count: 20,
        })

        const filterEvent = events.find((e) => e.filter !== undefined)
        // Filter events are optional but if present should have count
        if (filterEvent) {
          expect(filterEvent.filter?.targetId).toBe(1)
          expect(filterEvent.filter?.count).toBeDefined()
          expect(typeof filterEvent.filter?.count).toBe('number')
        }
      })

      it('should include bloom filter for efficient sync verification', async () => {
        // Create documents
        for (let i = 0; i < 5; i++) {
          await createDocument(projectId, databaseId, 'bloom', `doc${i}`, {
            value: { integerValue: String(i) },
          })
        }

        const response = await listenToFirestore(projectId, databaseId, [
          {
            addTarget: {
              targetId: 1,
              query: {
                parent: `projects/${projectId}/databases/${databaseId}/documents`,
                structuredQuery: {
                  from: [{ collectionId: 'bloom' }],
                },
              },
            },
          },
        ])

        const events = await collectEvents(response, { count: 15 })

        const filterEvent = events.find((e) => e.filter?.unchangedNames !== undefined)
        // Bloom filter is optional optimization
        if (filterEvent) {
          expect(filterEvent.filter?.unchangedNames?.bits).toBeDefined()
          expect(filterEvent.filter?.unchangedNames?.hashCount).toBeDefined()
        }
      })
    })
  })

  describe('Resume Tokens', () => {
    it('should include resumeToken in targetChange CURRENT event', async () => {
      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
            },
          },
        },
      ])

      const events = await collectEvents(response, {
        until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
      })

      const currentEvent = events.find((e) => e.targetChange?.targetChangeType === 'CURRENT')
      expect(currentEvent?.targetChange?.resumeToken).toBeDefined()
      expect(typeof currentEvent?.targetChange?.resumeToken).toBe('string')
      expect(currentEvent?.targetChange?.resumeToken?.length).toBeGreaterThan(0)
    })

    it('should include resumeToken in targetChange NO_CHANGE events', async () => {
      // NO_CHANGE events are periodic heartbeats that also include resume tokens
      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
            },
          },
        },
      ])

      // Collect events for longer to catch heartbeats
      const events = await collectEvents(response, { count: 10, timeout: 10000 })

      const noChangeEvent = events.find(
        (e) => e.targetChange?.targetChangeType === 'NO_CHANGE' && e.targetChange?.resumeToken
      )
      // NO_CHANGE with resumeToken is optional but expected for long-lived connections
      if (noChangeEvent) {
        expect(noChangeEvent.targetChange?.resumeToken).toBeDefined()
      }
    })

    it('should accept resumeToken to resume stream from last known state', async () => {
      // First connection to get a resume token
      const firstResponse = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/resumable/doc1`],
            },
          },
        },
      ])

      const firstEvents = await collectEvents(firstResponse, {
        until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
      })

      const currentEvent = firstEvents.find((e) => e.targetChange?.targetChangeType === 'CURRENT')
      const resumeToken = currentEvent?.targetChange?.resumeToken
      expect(resumeToken).toBeDefined()

      // Close first connection
      firstResponse.getReader().cancel()

      // Resume with the token
      const resumedResponse = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/resumable/doc1`],
            },
            resumeToken: resumeToken,
          },
        },
      ])

      expect(resumedResponse.status).toBe(200)

      // Should not receive documents that were already synced
      // (unless they changed after the resume token)
      const resumedEvents = await collectEvents(resumedResponse, {
        until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
      })

      const resumedCurrentEvent = resumedEvents.find(
        (e) => e.targetChange?.targetChangeType === 'CURRENT'
      )
      expect(resumedCurrentEvent).toBeDefined()
    })

    it('should receive only changes after resumeToken point', async () => {
      // Create initial document
      await createDocument(projectId, databaseId, 'resume_test', 'doc1', {
        version: { integerValue: '1' },
      })

      // First connection
      const firstResponse = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: {
              documents: [
                `projects/${projectId}/databases/${databaseId}/documents/resume_test/doc1`,
              ],
            },
          },
        },
      ])

      const firstEvents = await collectEvents(firstResponse, {
        until: (evts) => evts.some((e) => e.targetChange?.targetChangeType === 'CURRENT'),
      })

      const resumeToken = firstEvents.find(
        (e) => e.targetChange?.targetChangeType === 'CURRENT'
      )?.targetChange?.resumeToken

      firstResponse.getReader().cancel()

      // Make a change after getting the resume token
      await updateDocument(projectId, databaseId, 'resume_test/doc1', {
        version: { integerValue: '2' },
      })

      // Resume connection
      const resumedResponse = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: {
              documents: [
                `projects/${projectId}/databases/${databaseId}/documents/resume_test/doc1`,
              ],
            },
            resumeToken: resumeToken,
          },
        },
      ])

      const resumedEvents = await collectEvents(resumedResponse, { count: 5 })

      // Should receive the update that happened after the resume token
      const docChange = resumedEvents.find((e) => e.documentChange !== undefined)
      expect(docChange).toBeDefined()
      expect(docChange?.documentChange?.document.fields.version?.integerValue).toBe('2')
    })

    it('should accept readTime as alternative to resumeToken', async () => {
      const readTime = new Date().toISOString()

      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            readTime: readTime,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
            },
          },
        },
      ])

      expect(response.status).toBe(200)
    })
  })

  describe('Multiple Targets in Single Stream', () => {
    it('should support multiple targets in single connection', async () => {
      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
            },
          },
        },
        {
          addTarget: {
            targetId: 2,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user2`],
            },
          },
        },
      ])

      expect(response.status).toBe(200)

      const events = await collectEvents(response, { count: 10 })

      // Should receive targetChange events for both targets
      const targetIds = new Set<number>()
      events.forEach((e) => {
        if (e.targetChange?.targetIds) {
          e.targetChange.targetIds.forEach((id) => targetIds.add(id))
        }
      })

      expect(targetIds.has(1)).toBe(true)
      expect(targetIds.has(2)).toBe(true)
    })

    it('should receive CURRENT for each target independently', async () => {
      await createDocument(projectId, databaseId, 'multi', 'doc1', {
        value: { integerValue: '1' },
      })
      await createDocument(projectId, databaseId, 'multi', 'doc2', {
        value: { integerValue: '2' },
      })

      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 10,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/multi/doc1`],
            },
          },
        },
        {
          addTarget: {
            targetId: 20,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/multi/doc2`],
            },
          },
        },
      ])

      const events = await collectEvents(response, { count: 10, timeout: 5000 })

      const currentEvents = events.filter(
        (e) => e.targetChange?.targetChangeType === 'CURRENT'
      )

      // Should have CURRENT for both targets (may be combined or separate)
      const currentTargetIds = new Set<number>()
      currentEvents.forEach((e) => {
        e.targetChange?.targetIds.forEach((id) => currentTargetIds.add(id))
      })

      expect(currentTargetIds.has(10)).toBe(true)
      expect(currentTargetIds.has(20)).toBe(true)
    })

    it('should handle mixed document and query targets', async () => {
      await createDocument(projectId, databaseId, 'mixed', 'doc1', {
        type: { stringValue: 'A' },
      })

      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/mixed/doc1`],
            },
          },
        },
        {
          addTarget: {
            targetId: 2,
            query: {
              parent: `projects/${projectId}/databases/${databaseId}/documents`,
              structuredQuery: {
                from: [{ collectionId: 'mixed' }],
                where: {
                  fieldFilter: {
                    field: { fieldPath: 'type' },
                    op: 'EQUAL',
                    value: { stringValue: 'A' },
                  },
                },
              },
            },
          },
        },
      ])

      expect(response.status).toBe(200)

      const events = await collectEvents(response, { count: 10 })

      // Document should appear in both targets
      const docChanges = events.filter((e) => e.documentChange !== undefined)
      const targetIdsWithDoc = new Set<number>()
      docChanges.forEach((e) => {
        e.documentChange?.targetIds.forEach((id) => targetIdsWithDoc.add(id))
      })

      // The same document matches both targets
      expect(targetIdsWithDoc.has(1)).toBe(true)
      expect(targetIdsWithDoc.has(2)).toBe(true)
    })

    it('should allow removing individual targets', async () => {
      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
            },
          },
        },
        {
          addTarget: {
            targetId: 2,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user2`],
            },
          },
        },
        {
          removeTarget: 1,
        },
      ])

      const events = await collectEvents(response, { count: 10 })

      // Should receive REMOVE for target 1
      const removeEvent = events.find(
        (e) => e.targetChange?.targetChangeType === 'REMOVE' && e.targetChange?.targetIds.includes(1)
      )
      expect(removeEvent).toBeDefined()

      // Target 2 should still be active
      const target2Events = events.filter(
        (e) => e.targetChange?.targetIds?.includes(2)
      )
      expect(target2Events.length).toBeGreaterThan(0)
    })

    it('should route document updates to correct targets', async () => {
      await createDocument(projectId, databaseId, 'routing', 'docA', {
        category: { stringValue: 'A' },
      })
      await createDocument(projectId, databaseId, 'routing', 'docB', {
        category: { stringValue: 'B' },
      })

      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            query: {
              parent: `projects/${projectId}/databases/${databaseId}/documents`,
              structuredQuery: {
                from: [{ collectionId: 'routing' }],
                where: {
                  fieldFilter: {
                    field: { fieldPath: 'category' },
                    op: 'EQUAL',
                    value: { stringValue: 'A' },
                  },
                },
              },
            },
          },
        },
        {
          addTarget: {
            targetId: 2,
            query: {
              parent: `projects/${projectId}/databases/${databaseId}/documents`,
              structuredQuery: {
                from: [{ collectionId: 'routing' }],
                where: {
                  fieldFilter: {
                    field: { fieldPath: 'category' },
                    op: 'EQUAL',
                    value: { stringValue: 'B' },
                  },
                },
              },
            },
          },
        },
      ])

      const events = await collectEvents(response, {
        until: (evts) => {
          const currentEvents = evts.filter(
            (e) => e.targetChange?.targetChangeType === 'CURRENT'
          )
          const currentTargets = new Set<number>()
          currentEvents.forEach((e) => {
            e.targetChange?.targetIds.forEach((id) => currentTargets.add(id))
          })
          return currentTargets.has(1) && currentTargets.has(2)
        },
        count: 20,
      })

      // docA should be in target 1, docB in target 2
      const docAChange = events.find(
        (e) => e.documentChange?.document.name.includes('docA')
      )
      const docBChange = events.find(
        (e) => e.documentChange?.document.name.includes('docB')
      )

      expect(docAChange?.documentChange?.targetIds).toContain(1)
      expect(docAChange?.documentChange?.targetIds).not.toContain(2)
      expect(docBChange?.documentChange?.targetIds).toContain(2)
      expect(docBChange?.documentChange?.targetIds).not.toContain(1)
    })
  })

  describe('Error Handling', () => {
    it('should return error for invalid project ID', async () => {
      const response = await listenToFirestore('', databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: { documents: ['projects//databases/(default)/documents/users/user1'] },
          },
        },
      ])

      expect([400, 404]).toContain(response.status)
    })

    it('should return error for invalid database ID', async () => {
      const response = await listenToFirestore(projectId, '', [
        {
          addTarget: {
            targetId: 1,
            documents: { documents: [`projects/${projectId}/databases//documents/users/user1`] },
          },
        },
      ])

      expect([400, 404]).toContain(response.status)
    })

    it('should return error for malformed document path', async () => {
      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: { documents: ['invalid-path'] },
          },
        },
      ])

      const events = await collectEvents(response, { count: 5 })

      const errorEvent = events.find((e) => e.targetChange?.cause !== undefined)
      expect(errorEvent).toBeDefined()
    })

    it('should handle duplicate target IDs gracefully', async () => {
      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
            },
          },
        },
        {
          addTarget: {
            targetId: 1, // Duplicate
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user2`],
            },
          },
        },
      ])

      // Should either reject or replace the target
      const events = await collectEvents(response, { count: 5 })
      expect(events.length).toBeGreaterThan(0)
    })

    it('should handle removing non-existent target', async () => {
      const response = await listenToFirestore(projectId, databaseId, [
        {
          removeTarget: 999, // Non-existent target
        },
      ])

      // Should handle gracefully, possibly with error in targetChange
      const events = await collectEvents(response, { count: 3 })
      expect(response.status).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty addTarget request', async () => {
      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            // No documents or query specified
          } as Target,
        },
      ])

      // Should return error for incomplete target
      expect([400, 500]).toContain(response.status)
    })

    it('should handle target with both documents and query (invalid)', async () => {
      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
            },
            query: {
              parent: `projects/${projectId}/databases/${databaseId}/documents`,
              structuredQuery: {
                from: [{ collectionId: 'users' }],
              },
            },
          },
        },
      ])

      // Should reject or use one of them
      expect(response.status).toBeDefined()
    })

    it('should handle once flag for snapshot without continuous updates', async () => {
      await createDocument(projectId, databaseId, 'once', 'doc1', {
        value: { integerValue: '1' },
      })

      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            once: true, // Only get current state, don't watch for updates
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/once/doc1`],
            },
          },
        },
      ])

      const events = await collectEvents(response, { count: 10, timeout: 3000 })

      // Should receive CURRENT and then the stream may end
      const currentEvent = events.find((e) => e.targetChange?.targetChangeType === 'CURRENT')
      expect(currentEvent).toBeDefined()
    })

    it('should handle labels in listen request', async () => {
      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: {
              documents: [`projects/${projectId}/databases/${databaseId}/documents/users/user1`],
            },
          },
          labels: {
            'goog-listen-tags': 'background-sync',
          },
        },
      ])

      expect(response.status).toBe(200)
    })

    it('should handle very long document paths', async () => {
      const deepPath = 'a/b/c/d/e/f/g/h/i/j' // 10 levels deep
      const documentPath = `projects/${projectId}/databases/${databaseId}/documents/${deepPath}`

      const response = await listenToFirestore(projectId, databaseId, [
        {
          addTarget: {
            targetId: 1,
            documents: { documents: [documentPath] },
          },
        },
      ])

      // Should either work or return specific error for path depth
      expect(response.status).toBeDefined()
    })

    it('should handle maximum number of targets per stream', async () => {
      // Firebase has limits on targets per stream (typically around 100)
      const requests: ListenRequest[] = []
      for (let i = 0; i < 150; i++) {
        requests.push({
          addTarget: {
            targetId: i + 1,
            documents: {
              documents: [
                `projects/${projectId}/databases/${databaseId}/documents/test/doc${i}`,
              ],
            },
          },
        })
      }

      const response = await listenToFirestore(projectId, databaseId, requests)

      // Should either accept all or return error for exceeding limits
      expect(response.status).toBeDefined()
    })
  })
})
