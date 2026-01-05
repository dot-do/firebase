/**
 * Firestore Document CRUD Operations
 *
 * This module implements the Firestore REST API v1 for document operations
 * as specified in: https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents
 *
 * Supports:
 * - GET: Get a single document by path
 * - PATCH: Create or update a document
 * - DELETE: Delete a document
 * - Field masks for partial reads/writes
 * - Preconditions (exists, updateTime)
 * - All Firestore value types
 * - Subcollections
 */

import type { Value, MapValue } from './values'

/**
 * Firestore document representation
 */
export interface Document {
  /** Document name in format: projects/{project}/databases/{db}/documents/{path} */
  name: string
  /** Document fields */
  fields?: Record<string, Value>
  /** Creation timestamp (RFC3339) */
  createTime?: string
  /** Last update timestamp (RFC3339) */
  updateTime?: string
}

/**
 * Preconditions for conditional writes
 */
export interface Precondition {
  /** When set to true, the document must exist. When set to false, the document must not exist. */
  exists?: boolean
  /** When set, the document must have been last updated at that time. */
  updateTime?: string
}

/**
 * Options for getting a document
 */
export interface GetDocumentOptions {
  /** List of field paths to return. If not set, returns all fields. */
  mask?: string[]
}

/**
 * Options for updating a document
 */
export interface UpdateDocumentOptions {
  /** List of field paths to update. If not set, updates all fields. */
  updateMask?: string[]
  /** Preconditions for the update */
  currentDocument?: Precondition
}

/**
 * Options for deleting a document
 */
export interface DeleteDocumentOptions {
  /** Preconditions for the delete */
  currentDocument?: Precondition
}

/**
 * Error response from Firestore API
 */
export interface FirestoreError {
  error: {
    code: number
    message: string
    status: string
  }
}

/**
 * In-memory document storage - shared across all Firestore operations
 */
const documentStore = new Map<string, Document>()

// ============================================================================
// Document Change Event System (for Watch API)
// ============================================================================

/**
 * Types of document change events
 */
export type DocumentChangeType = 'added' | 'modified' | 'removed'

/**
 * Document change event
 */
export interface DocumentChangeEvent {
  type: DocumentChangeType
  path: string
  document?: Document
  oldDocument?: Document
}

/**
 * Document change listener callback
 */
export type DocumentChangeListener = (event: DocumentChangeEvent) => void

/**
 * Set of registered document change listeners
 */
const documentChangeListeners = new Set<DocumentChangeListener>()

/**
 * Subscribe to document changes
 * @param listener - Callback to invoke on document changes
 * @returns Unsubscribe function
 */
export function subscribeToDocumentChanges(listener: DocumentChangeListener): () => void {
  documentChangeListeners.add(listener)
  return () => {
    documentChangeListeners.delete(listener)
  }
}

/**
 * Emit a document change event to all listeners
 */
function emitDocumentChange(event: DocumentChangeEvent): void {
  for (const listener of documentChangeListeners) {
    try {
      listener(event)
    } catch (error) {
      console.error('Document change listener error:', error)
    }
  }
}

/**
 * Get all documents in a collection (for Watch initial sync)
 * @param collectionPath - Collection path pattern (e.g., "projects/x/databases/y/documents/users")
 * @returns Array of documents in the collection
 */
export function getDocumentsInCollection(collectionPath: string): Document[] {
  const results: Document[] = []
  const prefix = collectionPath.endsWith('/') ? collectionPath : `${collectionPath}/`

  for (const [path, doc] of documentStore.entries()) {
    // Match documents directly in this collection (not subcollections)
    if (path.startsWith(prefix)) {
      const relativePath = path.slice(prefix.length)
      // Only include if it's a direct child (no additional slashes)
      if (!relativePath.includes('/')) {
        results.push({ ...doc })
      }
    }
  }

  return results
}

/**
 * Get a raw document directly from the store (for internal use by batch.ts)
 * Unlike getDocument(), this returns the actual stored document without copying
 *
 * @param path - Full document path
 * @returns The document if found, or null if not found
 */
export function getDocumentRaw(path: string): Document | null {
  return documentStore.get(path) || null
}

/**
 * Set a document directly in the store (for internal use by batch.ts)
 *
 * @param path - Full document path
 * @param doc - The document to store
 */
export function setDocumentRaw(path: string, doc: Document): void {
  const existing = documentStore.get(path)
  documentStore.set(path, doc)

  // Emit change event
  emitDocumentChange({
    type: existing ? 'modified' : 'added',
    path,
    document: doc,
    oldDocument: existing,
  })
}

/**
 * Delete a document directly from the store (for internal use by batch.ts)
 *
 * @param path - Full document path
 */
export function deleteDocumentRaw(path: string): void {
  const existing = documentStore.get(path)
  documentStore.delete(path)

  if (existing) {
    emitDocumentChange({
      type: 'removed',
      path,
      oldDocument: existing,
    })
  }
}

/**
 * Check if a document exists in the store
 *
 * @param path - Full document path
 * @returns true if document exists
 */
export function documentExists(path: string): boolean {
  return documentStore.has(path)
}

/**
 * Get a document by its path
 *
 * @param path - Full document path (projects/{project}/databases/{db}/documents/{collection}/{docId})
 * @param options - Options for the get operation
 * @returns The document if found, or null if not found
 */
export function getDocument(
  path: string,
  options?: GetDocumentOptions
): Document | null {
  const doc = documentStore.get(path)

  if (!doc) {
    return null
  }

  // Create a copy to avoid mutation
  const result: Document = {
    name: doc.name,
    createTime: doc.createTime,
    updateTime: doc.updateTime,
  }

  // Apply field mask if specified
  if (options?.mask && options.mask.length > 0) {
    if (doc.fields) {
      result.fields = {}
      for (const fieldPath of options.mask) {
        const value = getFieldByPath(doc.fields, fieldPath)
        if (value !== undefined) {
          setFieldByPath(result.fields, fieldPath, value)
        }
      }
    }
  } else {
    // Return all fields
    result.fields = doc.fields ? JSON.parse(JSON.stringify(doc.fields)) : undefined
  }

  return result
}

/**
 * Create or update a document
 *
 * @param path - Full document path
 * @param fields - Document fields to set
 * @param options - Options for the update operation
 * @returns The created/updated document
 * @throws Error if preconditions fail
 */
export function updateDocument(
  path: string,
  fields: Record<string, Value>,
  options?: UpdateDocumentOptions
): Document {
  const existingDoc = documentStore.get(path) ?? null
  const now = getCurrentTimestamp()

  // Check preconditions
  if (options?.currentDocument) {
    checkPrecondition(existingDoc, options.currentDocument)
  }

  let resultFields: Record<string, Value> = {}

  if (existingDoc) {
    // Document exists - update it
    if (options?.updateMask && options.updateMask.length > 0) {
      // Partial update with update mask
      resultFields = existingDoc.fields
        ? JSON.parse(JSON.stringify(existingDoc.fields))
        : {}

      // Update only specified fields
      for (const fieldPath of options.updateMask) {
        const value = getFieldByPath(fields, fieldPath)
        if (value !== undefined) {
          setFieldByPath(resultFields, fieldPath, value)
        } else {
          // If field not provided in update, delete it
          deleteFieldByPath(resultFields, fieldPath)
        }
      }
    } else {
      // Full update - replace all fields
      resultFields = fields
    }

    const updatedDoc: Document = {
      name: path,
      fields: Object.keys(resultFields).length > 0 ? resultFields : undefined,
      createTime: existingDoc.createTime,
      updateTime: now,
    }

    documentStore.set(path, updatedDoc)
    return JSON.parse(JSON.stringify(updatedDoc))
  } else {
    // Document doesn't exist - create it
    const newDoc: Document = {
      name: path,
      fields: Object.keys(fields).length > 0 ? fields : undefined,
      createTime: now,
      updateTime: now,
    }

    documentStore.set(path, newDoc)
    return JSON.parse(JSON.stringify(newDoc))
  }
}

/**
 * Delete a document
 *
 * @param path - Full document path
 * @param options - Options for the delete operation
 * @returns true if deleted, false if not found
 * @throws Error if preconditions fail
 */
export function deleteDocument(
  path: string,
  options?: DeleteDocumentOptions
): boolean {
  const existingDoc = documentStore.get(path) ?? null

  // Check preconditions first (will throw if fails)
  if (options?.currentDocument) {
    checkPrecondition(existingDoc, options.currentDocument)
  }

  // If document doesn't exist after precondition check, return false
  if (!existingDoc) {
    return false
  }

  documentStore.delete(path)
  return true
}

/**
 * Clear all documents from the store (for testing)
 */
export function clearAllDocuments(): void {
  documentStore.clear()
  timestampCounter = 0
}

/**
 * Get all documents (for testing/debugging)
 */
export function getAllDocuments(): Map<string, Document> {
  return new Map(documentStore)
}

/**
 * Check if a precondition is satisfied
 *
 * @param doc - The existing document (or null if doesn't exist)
 * @param precondition - The precondition to check
 * @throws Error if precondition fails
 */
function checkPrecondition(doc: Document | null, precondition: Precondition): void {
  // Check exists precondition
  if (precondition.exists !== undefined) {
    const exists = doc !== null

    // Debug logging
    if (process.env.DEBUG_PRECONDITION) {
      console.log('[DEBUG] checkPrecondition:', {
        docExists: exists,
        preconditionExists: precondition.exists,
        docName: doc?.name
      })
    }

    if (precondition.exists && !exists) {
      throw createError(404, 'NOT_FOUND', 'Document not found')
    }

    if (!precondition.exists && exists) {
      throw createError(409, 'FAILED_PRECONDITION', 'Document already exists')
    }
  }

  // Check updateTime precondition
  if (precondition.updateTime !== undefined) {
    if (!doc) {
      throw createError(404, 'NOT_FOUND', 'Document not found')
    }

    if (doc.updateTime !== precondition.updateTime) {
      throw createError(
        409,
        'FAILED_PRECONDITION',
        `Update time does not match. Expected: ${precondition.updateTime}, Actual: ${doc.updateTime}`
      )
    }
  }
}

/**
 * Get a field value by dot-notation path
 *
 * @param fields - The fields object
 * @param path - Dot-notation path (e.g., "address.city")
 * @returns The field value or undefined if not found
 */
function getFieldByPath(
  fields: Record<string, Value>,
  path: string
): Value | undefined {
  const parts = path.split('.')
  let current: Value | undefined = { mapValue: { fields } }

  for (const part of parts) {
    if (!current?.mapValue?.fields) {
      return undefined
    }
    current = current.mapValue.fields[part]
  }

  return current
}

/**
 * Set a field value by dot-notation path
 *
 * @param fields - The fields object to modify
 * @param path - Dot-notation path (e.g., "address.city")
 * @param value - The value to set
 */
function setFieldByPath(
  fields: Record<string, Value>,
  path: string,
  value: Value
): void {
  const parts = path.split('.')
  let current = fields

  // Navigate to the parent of the target field
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]

    if (!current[part]) {
      current[part] = { mapValue: { fields: {} } }
    }

    if (!current[part].mapValue) {
      current[part] = { mapValue: { fields: {} } }
    }

    if (!current[part].mapValue!.fields) {
      current[part].mapValue!.fields = {}
    }

    current = current[part].mapValue!.fields!
  }

  // Set the final field
  current[parts[parts.length - 1]] = value
}

/**
 * Delete a field by dot-notation path
 *
 * @param fields - The fields object to modify
 * @param path - Dot-notation path (e.g., "address.city")
 */
function deleteFieldByPath(fields: Record<string, Value>, path: string): void {
  const parts = path.split('.')
  let current = fields

  // Navigate to the parent of the target field
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]

    if (!current[part]?.mapValue?.fields) {
      return // Path doesn't exist
    }

    current = current[part].mapValue!.fields!
  }

  // Delete the final field
  delete current[parts[parts.length - 1]]
}

/**
 * Counter for generating unique timestamps
 */
let timestampCounter = 0

/**
 * Get current timestamp in RFC3339 format
 *
 * @returns Current timestamp string
 */
function getCurrentTimestamp(): string {
  const now = new Date()
  // RFC3339 with nanoseconds: 2024-01-15T10:30:00.123456789Z
  // JavaScript only has millisecond precision, so we use a counter for uniqueness
  const isoString = now.toISOString() // e.g., 2024-01-15T10:30:00.123Z

  // Increment counter for uniqueness (wrap at 1 million)
  timestampCounter = (timestampCounter + 1) % 1000000

  // Replace milliseconds with microseconds/nanoseconds format
  // Use counter to ensure different timestamps even in same millisecond
  const withNanos = isoString.replace(/(\.\d{3})Z$/, (match, ms) => {
    // Pad milliseconds to nanoseconds, adding counter value
    const nanos = String(timestampCounter).padStart(6, '0')
    return ms + nanos + 'Z'
  })

  return withNanos
}

/**
 * Create a Firestore error object
 *
 * @param code - HTTP status code
 * @param status - Status string (e.g., "NOT_FOUND")
 * @param message - Error message
 * @returns Error object
 */
function createError(code: number, status: string, message: string): Error {
  const error = new Error(message) as Error & { firestoreError: FirestoreError }
  error.firestoreError = {
    error: {
      code,
      message,
      status,
    },
  }
  return error
}

/**
 * Parse document path and extract components
 *
 * @param path - Full document path
 * @returns Parsed path components
 */
export function parseDocumentPath(path: string): {
  projectId: string
  databaseId: string
  documentPath: string
} | null {
  const regex =
    /^projects\/([^/]+)\/databases\/([^/]+)\/documents\/(.+)$/
  const match = path.match(regex)

  if (!match) {
    return null
  }

  return {
    projectId: match[1],
    databaseId: match[2],
    documentPath: match[3],
  }
}

/**
 * Build document path from components
 *
 * @param projectId - Project ID
 * @param databaseId - Database ID
 * @param documentPath - Document path (collection/doc/subcollection/doc/...)
 * @returns Full document path
 */
export function buildDocumentPath(
  projectId: string,
  databaseId: string,
  documentPath: string
): string {
  return `projects/${projectId}/databases/${databaseId}/documents/${documentPath}`
}

/**
 * Validate document path format
 *
 * @param path - Document path to validate
 * @returns true if valid
 */
export function isValidDocumentPath(path: string): boolean {
  const parsed = parseDocumentPath(path)
  if (!parsed) {
    return false
  }

  // Document path should have even number of segments (collection/doc pairs)
  const segments = parsed.documentPath.split('/')
  return segments.length % 2 === 0 && segments.length > 0
}
