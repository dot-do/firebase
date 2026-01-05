/**
 * Firestore Batch and Transaction Operations
 *
 * This module implements Firebase Firestore's batch operations and transactions:
 * - batchGet: Retrieve multiple documents in a single request
 * - commit: Write multiple documents atomically (batch writes and transactions)
 * - beginTransaction: Start a new transaction
 * - rollback: Abort a transaction
 *
 * @see https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/batchGet
 * @see https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit
 * @see https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/beginTransaction
 * @see https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/rollback
 */

import { Value } from './values'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Firestore document structure matching REST API format
 */
export interface FirestoreDocument {
  /** Full document path: projects/{project}/databases/{database}/documents/{path}/{id} */
  name: string
  /** Document fields as Firestore values */
  fields?: Record<string, Value>
  /** ISO 8601 timestamp of document creation */
  createTime?: string
  /** ISO 8601 timestamp of last update */
  updateTime?: string
}

/**
 * Request to get multiple documents in a single call
 */
export interface BatchGetRequest {
  /** Array of full document paths to retrieve */
  documents: string[]
  /** Optional field mask to limit returned fields */
  mask?: DocumentMask
  /** Transaction ID to read within */
  transaction?: string
  /** Options to start a new transaction */
  newTransaction?: TransactionOptions
  /** Timestamp to read documents as they were at that time */
  readTime?: string
}

/**
 * Field mask to select specific document fields
 */
export interface DocumentMask {
  /** Array of field paths (e.g., ['name', 'profile.email']) */
  fieldPaths: string[]
}

/**
 * Response for a single document in batchGet
 */
export interface BatchGetResponse {
  /** The document if it was found */
  found?: FirestoreDocument
  /** The document path if it was not found */
  missing?: string
  /** Timestamp when the document was read */
  readTime: string
  /** Transaction ID if read within a transaction */
  transaction?: string
}

/**
 * A single write operation (update, delete, or transform)
 */
export interface Write {
  /** Update/create a document */
  update?: FirestoreDocument
  /** Delete a document by path */
  delete?: string
  /** Apply field transformations */
  transform?: DocumentTransform
  /** Field mask for partial updates */
  updateMask?: DocumentMask
  /** Field transformations to apply after update */
  updateTransforms?: FieldTransform[]
  /** Precondition that must be met for write to succeed */
  currentDocument?: Precondition
}

/**
 * Document transformation operations
 */
export interface DocumentTransform {
  /** Full document path to transform */
  document: string
  /** Array of field transformations to apply */
  fieldTransforms: FieldTransform[]
}

/**
 * Field-level transformation operation
 */
export interface FieldTransform {
  /** Field path to transform */
  fieldPath: string
  /** Set field to server timestamp */
  setToServerValue?: 'REQUEST_TIME'
  /** Increment numeric field */
  increment?: Value
  /** Set to maximum of current and given value */
  maximum?: Value
  /** Set to minimum of current and given value */
  minimum?: Value
  /** Add elements to array if not present (union) */
  appendMissingElements?: ArrayValue
  /** Remove elements from array */
  removeAllFromArray?: ArrayValue
}

/**
 * Array value for field transforms
 */
export interface ArrayValue {
  values: Value[]
}

/**
 * Precondition for write operations
 */
export interface Precondition {
  /** Document must exist (true) or not exist (false) */
  exists?: boolean
  /** Document must have this exact updateTime */
  updateTime?: string
}

/**
 * Request to commit writes atomically
 */
export interface CommitRequest {
  /** Array of write operations to perform */
  writes: Write[]
  /** Optional transaction ID for transactional writes */
  transaction?: string
}

/**
 * Result of a single write operation
 */
export interface WriteResult {
  /** Timestamp when the write was applied */
  updateTime: string
  /** Results of any field transformations */
  transformResults?: Value[]
}

/**
 * Response from a commit operation
 */
export interface CommitResponse {
  /** Results for each write, in same order as request */
  writeResults: WriteResult[]
  /** Timestamp when the entire commit was applied */
  commitTime: string
}

/**
 * Options for starting a transaction
 */
export interface TransactionOptions {
  /** Read-only transaction options */
  readOnly?: ReadOnlyOptions
  /** Read-write transaction options */
  readWrite?: ReadWriteOptions
}

/**
 * Options for read-only transactions
 */
export interface ReadOnlyOptions {
  /** Read documents at this specific timestamp */
  readTime?: string
}

/**
 * Options for read-write transactions
 */
export interface ReadWriteOptions {
  /** Previous transaction ID to retry */
  retryTransaction?: string
}

/**
 * Request to begin a new transaction
 */
export interface BeginTransactionRequest {
  /** Transaction options */
  options?: TransactionOptions
}

/**
 * Response containing new transaction ID
 */
export interface BeginTransactionResponse {
  /** Unique transaction identifier */
  transaction: string
}

/**
 * Request to rollback a transaction
 */
export interface RollbackRequest {
  /** Transaction ID to rollback */
  transaction: string
}

// ============================================================================
// Internal Types for Transaction Management
// ============================================================================

/**
 * Transaction state
 */
interface TransactionState {
  /** Unique transaction ID */
  id: string
  /** Whether this is read-only */
  readOnly: boolean
  /** Timestamp when transaction started */
  startTime: string
  /** Snapshot of documents read in this transaction */
  readSnapshot: Map<string, FirestoreDocument | null>
  /** Whether the transaction has been committed */
  committed: boolean
  /** Whether the transaction has been rolled back */
  rolledBack: boolean
}

/**
 * In-memory document storage
 * In a real implementation, this would be backed by Cloudflare Durable Objects or KV
 */
class DocumentStore {
  private documents = new Map<string, FirestoreDocument>()
  private transactions = new Map<string, TransactionState>()

  /**
   * Get a document by path
   */
  get(path: string): FirestoreDocument | null {
    return this.documents.get(path) || null
  }

  /**
   * Set a document
   */
  set(path: string, doc: FirestoreDocument): void {
    this.documents.set(path, doc)
  }

  /**
   * Delete a document
   */
  delete(path: string): void {
    this.documents.delete(path)
  }

  /**
   * Check if document exists
   */
  exists(path: string): boolean {
    return this.documents.has(path)
  }

  /**
   * Create a new transaction
   */
  createTransaction(id: string, readOnly: boolean): TransactionState {
    const state: TransactionState = {
      id,
      readOnly,
      startTime: new Date().toISOString(),
      readSnapshot: new Map(),
      committed: false,
      rolledBack: false,
    }
    this.transactions.set(id, state)
    return state
  }

  /**
   * Get transaction state
   */
  getTransaction(id: string): TransactionState | null {
    return this.transactions.get(id) || null
  }

  /**
   * Remove transaction from storage
   */
  deleteTransaction(id: string): void {
    this.transactions.delete(id)
  }

  /**
   * Read document within transaction context
   */
  readInTransaction(txId: string, path: string): FirestoreDocument | null {
    const tx = this.transactions.get(txId)
    if (!tx) {
      return null
    }

    // Check if already read in this transaction
    if (tx.readSnapshot.has(path)) {
      return tx.readSnapshot.get(path) || null
    }

    // Read document and add to snapshot
    const doc = this.get(path)
    tx.readSnapshot.set(path, doc)
    return doc
  }
}

// Global document store (in production, this would be Durable Objects)
const store = new DocumentStore()

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates a document path format
 */
function validateDocumentPath(path: string): { projectId: string; database: string; collection: string; docId: string } | null {
  // Expected format: projects/{project}/databases/{database}/documents/{collection}/{docId}
  const match = path.match(/^projects\/([^/]+)\/databases\/([^/]+)\/documents\/(.+)$/)
  if (!match) {
    return null
  }

  const [, projectId, database, collectionPath] = match

  // Validate project ID format (alphanumeric, hyphens, no special characters)
  if (!/^[a-zA-Z0-9-]+$/.test(projectId)) {
    return null
  }

  const parts = collectionPath.split('/')

  // Must have at least collection/docId
  if (parts.length < 2 || parts.length % 2 !== 0) {
    return null
  }

  // For simplicity, we'll just validate the format
  const docId = parts[parts.length - 1]
  const collection = parts.slice(0, -1).join('/')

  return { projectId, database, collection, docId }
}

/**
 * Validates database name
 */
function validateDatabase(database: string): boolean {
  // Only support (default) database for now, reject others
  return database === '(default)'
}

/**
 * Generates a unique transaction ID
 */
function generateTransactionId(): string {
  // Generate a random base64-like transaction ID
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Gets current timestamp in ISO 8601 format
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString()
}

/**
 * Apply field mask to document fields
 */
function applyFieldMask(fields: Record<string, Value>, mask: DocumentMask): Record<string, Value> {
  const result: Record<string, Value> = {}

  for (const path of mask.fieldPaths) {
    const value = getFieldByPath(fields, path)
    if (value !== undefined) {
      setFieldByPath(result, path, value)
    }
  }

  return result
}

/**
 * Get field value by dot-separated path
 */
function getFieldByPath(fields: Record<string, Value>, path: string): Value | undefined {
  const parts = path.split('.')
  let current: any = fields

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!current || typeof current !== 'object') {
      return undefined
    }

    if (i === parts.length - 1) {
      return current[part]
    }

    // Navigate deeper into mapValue
    const value = current[part]
    if (!value?.mapValue?.fields) {
      return undefined
    }
    current = value.mapValue.fields
  }

  return undefined
}

/**
 * Set field value by dot-separated path
 */
function setFieldByPath(fields: Record<string, Value>, path: string, value: Value): void {
  const parts = path.split('.')
  let current = fields

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!current[part]) {
      current[part] = { mapValue: { fields: {} } }
    }
    if (!current[part].mapValue?.fields) {
      current[part] = { mapValue: { fields: {} } }
    }
    current = current[part].mapValue!.fields!
  }

  current[parts[parts.length - 1]] = value
}

/**
 * Apply field transforms to document
 */
function applyFieldTransforms(
  doc: FirestoreDocument | null,
  transforms: FieldTransform[]
): { fields: Record<string, Value>; transformResults: Value[] } {
  const fields = doc?.fields ? { ...doc.fields } : {}
  const transformResults: Value[] = []

  for (const transform of transforms) {
    const { fieldPath } = transform

    if (transform.setToServerValue === 'REQUEST_TIME') {
      const timestamp = getCurrentTimestamp()
      setFieldByPath(fields, fieldPath, { timestampValue: timestamp })
      transformResults.push({ timestampValue: timestamp })
    } else if (transform.increment) {
      const currentValue = getFieldByPath(fields, fieldPath)
      const current = getNumericValue(currentValue) || 0
      const delta = getNumericValue(transform.increment) || 0
      const newValue = current + delta

      const resultValue = Number.isInteger(newValue)
        ? { integerValue: String(newValue) }
        : { doubleValue: newValue }

      setFieldByPath(fields, fieldPath, resultValue)
      transformResults.push(resultValue)
    } else if (transform.maximum) {
      const currentValue = getFieldByPath(fields, fieldPath)
      const current = getNumericValue(currentValue) || -Infinity
      const compare = getNumericValue(transform.maximum) || -Infinity
      const newValue = Math.max(current, compare)

      const resultValue = Number.isInteger(newValue)
        ? { integerValue: String(newValue) }
        : { doubleValue: newValue }

      setFieldByPath(fields, fieldPath, resultValue)
      transformResults.push(resultValue)
    } else if (transform.minimum) {
      const currentValue = getFieldByPath(fields, fieldPath)
      const current = getNumericValue(currentValue) || Infinity
      const compare = getNumericValue(transform.minimum) || Infinity
      const newValue = Math.min(current, compare)

      const resultValue = Number.isInteger(newValue)
        ? { integerValue: String(newValue) }
        : { doubleValue: newValue }

      setFieldByPath(fields, fieldPath, resultValue)
      transformResults.push(resultValue)
    } else if (transform.appendMissingElements) {
      const currentValue = getFieldByPath(fields, fieldPath)
      const currentArray = currentValue?.arrayValue?.values || []
      const toAdd = transform.appendMissingElements.values

      const newArray = [...currentArray]
      for (const value of toAdd) {
        if (!arrayContainsValue(currentArray, value)) {
          newArray.push(value)
        }
      }

      const resultValue = { arrayValue: { values: newArray } }
      setFieldByPath(fields, fieldPath, resultValue)
      transformResults.push(resultValue)
    } else if (transform.removeAllFromArray) {
      const currentValue = getFieldByPath(fields, fieldPath)
      const currentArray = currentValue?.arrayValue?.values || []
      const toRemove = transform.removeAllFromArray.values

      const newArray = currentArray.filter(v => !arrayContainsValue(toRemove, v))

      const resultValue = { arrayValue: { values: newArray } }
      setFieldByPath(fields, fieldPath, resultValue)
      transformResults.push(resultValue)
    }
  }

  return { fields, transformResults }
}

/**
 * Get numeric value from Firestore Value
 */
function getNumericValue(value: Value | undefined): number | null {
  if (!value) return null
  if (value.integerValue !== undefined) return Number(value.integerValue)
  if (value.doubleValue !== undefined) return value.doubleValue
  return null
}

/**
 * Check if array contains a value (deep equality)
 */
function arrayContainsValue(array: Value[], value: Value): boolean {
  return array.some(v => JSON.stringify(v) === JSON.stringify(value))
}

/**
 * Check if precondition is satisfied
 */
function checkPrecondition(
  doc: FirestoreDocument | null,
  precondition: Precondition
): { satisfied: boolean; error?: string; status?: string } {
  if (precondition.exists !== undefined) {
    const exists = doc !== null
    if (precondition.exists && !exists) {
      return { satisfied: false, error: 'Document does not exist', status: 'FAILED_PRECONDITION' }
    }
    if (!precondition.exists && exists) {
      return { satisfied: false, error: 'Document already exists', status: 'ALREADY_EXISTS' }
    }
  }

  if (precondition.updateTime !== undefined) {
    if (!doc) {
      return { satisfied: false, error: 'Document does not exist', status: 'FAILED_PRECONDITION' }
    }
    if (doc.updateTime !== precondition.updateTime) {
      return { satisfied: false, error: 'Document updateTime does not match', status: 'FAILED_PRECONDITION' }
    }
  }

  return { satisfied: true }
}

/**
 * Apply update mask to merge fields
 */
function applyUpdateMask(
  existing: Record<string, Value> | undefined,
  update: Record<string, Value>,
  mask: DocumentMask
): Record<string, Value> {
  const result = existing ? { ...existing } : {}

  for (const path of mask.fieldPaths) {
    const value = getFieldByPath(update, path)
    if (value !== undefined) {
      setFieldByPath(result, path, value)
    }
  }

  return result
}

// ============================================================================
// Main API Functions
// ============================================================================

/**
 * Batch get multiple documents
 *
 * @see https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/batchGet
 */
export async function batchGet(request: BatchGetRequest): Promise<{ status: number; body: any }> {
  try {
    // Validate request
    if (!request.documents || !Array.isArray(request.documents)) {
      return {
        status: 400,
        body: {
          error: {
            code: 400,
            message: 'documents field is required and must be an array',
            status: 'INVALID_ARGUMENT',
          },
        },
      }
    }

    if (request.documents.length === 0) {
      return {
        status: 400,
        body: {
          error: {
            code: 400,
            message: 'documents array cannot be empty',
            status: 'INVALID_ARGUMENT',
          },
        },
      }
    }

    if (request.documents.length > 100) {
      return {
        status: 400,
        body: {
          error: {
            code: 400,
            message: 'documents array cannot exceed 100 items',
            status: 'INVALID_ARGUMENT',
          },
        },
      }
    }

    // Validate all document paths
    for (const path of request.documents) {
      const parsed = validateDocumentPath(path)
      if (!parsed) {
        return {
          status: 400,
          body: {
            error: {
              code: 400,
              message: `Invalid document path: ${path}`,
              status: 'INVALID_ARGUMENT',
            },
          },
        }
      }

      // Validate database
      if (!validateDatabase(parsed.database)) {
        return {
          status: 404,
          body: {
            error: {
              code: 404,
              message: `Database ${parsed.database} not found`,
              status: 'NOT_FOUND',
            },
          },
        }
      }
    }

    // Handle transaction
    let transaction: TransactionState | null = null
    let newTransactionId: string | undefined

    if (request.transaction) {
      transaction = store.getTransaction(request.transaction)
      if (!transaction) {
        return {
          status: 400,
          body: {
            error: {
              code: 400,
              message: 'Invalid transaction ID',
              status: 'INVALID_ARGUMENT',
            },
          },
        }
      }

      if (transaction.committed || transaction.rolledBack) {
        return {
          status: 400,
          body: {
            error: {
              code: 400,
              message: 'Transaction has already been committed or rolled back',
              status: 'INVALID_ARGUMENT',
            },
          },
        }
      }
    } else if (request.newTransaction) {
      newTransactionId = generateTransactionId()
      const readOnly = !!request.newTransaction.readOnly
      transaction = store.createTransaction(newTransactionId, readOnly)
    }

    // Read documents
    const readTime = getCurrentTimestamp()
    const responses: BatchGetResponse[] = []

    for (const docPath of request.documents) {
      let doc: FirestoreDocument | null

      if (transaction) {
        doc = store.readInTransaction(transaction.id, docPath)
      } else {
        doc = store.get(docPath)
      }

      const response: BatchGetResponse = {
        readTime,
      }

      if (newTransactionId) {
        response.transaction = newTransactionId
      }

      if (doc) {
        // Apply field mask if provided
        let fields = doc.fields
        if (request.mask && fields) {
          fields = applyFieldMask(fields, request.mask)
        }

        response.found = {
          name: doc.name,
          fields,
          createTime: doc.createTime,
          updateTime: doc.updateTime,
        }
      } else {
        response.missing = docPath
      }

      responses.push(response)
    }

    return {
      status: 200,
      body: responses,
    }
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: 500,
          message: error instanceof Error ? error.message : 'Internal error',
          status: 'INTERNAL',
        },
      },
    }
  }
}

/**
 * Commit writes atomically
 *
 * @see https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit
 */
export async function commit(request: CommitRequest): Promise<{ status: number; body: any }> {
  try {
    // Validate request
    if (!request.writes || !Array.isArray(request.writes)) {
      return {
        status: 400,
        body: {
          error: {
            code: 400,
            message: 'writes field is required and must be an array',
            status: 'INVALID_ARGUMENT',
          },
        },
      }
    }

    if (request.writes.length > 500) {
      return {
        status: 400,
        body: {
          error: {
            code: 400,
            message: 'writes array cannot exceed 500 items',
            status: 'INVALID_ARGUMENT',
          },
        },
      }
    }

    // Handle transaction
    let transaction: TransactionState | null = null
    if (request.transaction) {
      transaction = store.getTransaction(request.transaction)
      if (!transaction) {
        return {
          status: 400,
          body: {
            error: {
              code: 400,
              message: 'Invalid transaction ID',
              status: 'INVALID_ARGUMENT',
            },
          },
        }
      }

      if (transaction.committed || transaction.rolledBack) {
        return {
          status: 400,
          body: {
            error: {
              code: 400,
              message: 'Transaction has already been committed or rolled back',
              status: 'INVALID_ARGUMENT',
            },
          },
        }
      }

      if (transaction.readOnly) {
        return {
          status: 400,
          body: {
            error: {
              code: 400,
              message: 'Cannot commit writes in a read-only transaction',
              status: 'INVALID_ARGUMENT',
            },
          },
        }
      }

      // Check for conflicts
      for (const [path, snapshot] of transaction.readSnapshot.entries()) {
        const current = store.get(path)
        // Check if document has been modified since we read it
        if ((snapshot?.updateTime || null) !== (current?.updateTime || null)) {
          return {
            status: 409,
            body: {
              error: {
                code: 409,
                message: 'Transaction aborted due to conflicting modifications',
                status: 'ABORTED',
              },
            },
          }
        }
      }
    }

    // Validate all writes and check preconditions
    const pendingWrites: Array<{
      write: Write
      docPath: string
      currentDoc: FirestoreDocument | null
    }> = []

    for (const write of request.writes) {
      if (write.update) {
        const docPath = write.update.name
        const parsed = validateDocumentPath(docPath)
        if (!parsed) {
          return {
            status: 400,
            body: {
              error: {
                code: 400,
                message: `Invalid document path: ${docPath}`,
                status: 'INVALID_ARGUMENT',
              },
            },
          }
        }

        // Validate database
        if (!validateDatabase(parsed.database)) {
          return {
            status: 404,
            body: {
              error: {
                code: 404,
                message: `Database ${parsed.database} not found`,
                status: 'NOT_FOUND',
              },
            },
          }
        }

        const currentDoc = store.get(docPath)

        // Check precondition
        if (write.currentDocument) {
          const check = checkPrecondition(currentDoc, write.currentDocument)
          if (!check.satisfied) {
            return {
              status: 400,
              body: {
                error: {
                  code: 400,
                  message: check.error,
                  status: check.status,
                },
              },
            }
          }
        }

        pendingWrites.push({ write, docPath, currentDoc })
      } else if (write.delete) {
        const docPath = write.delete
        const parsed = validateDocumentPath(docPath)
        if (!parsed) {
          return {
            status: 400,
            body: {
              error: {
                code: 400,
                message: `Invalid document path: ${docPath}`,
                status: 'INVALID_ARGUMENT',
              },
            },
          }
        }

        // Validate database
        if (!validateDatabase(parsed.database)) {
          return {
            status: 404,
            body: {
              error: {
                code: 404,
                message: `Database ${parsed.database} not found`,
                status: 'NOT_FOUND',
              },
            },
          }
        }

        const currentDoc = store.get(docPath)

        // Check precondition
        if (write.currentDocument) {
          const check = checkPrecondition(currentDoc, write.currentDocument)
          if (!check.satisfied) {
            return {
              status: 400,
              body: {
                error: {
                  code: 400,
                  message: check.error,
                  status: check.status,
                },
              },
            }
          }
        }

        pendingWrites.push({ write, docPath, currentDoc })
      } else if (write.transform) {
        const docPath = write.transform.document
        const parsed = validateDocumentPath(docPath)
        if (!parsed) {
          return {
            status: 400,
            body: {
              error: {
                code: 400,
                message: `Invalid document path: ${docPath}`,
                status: 'INVALID_ARGUMENT',
              },
            },
          }
        }

        // Validate database
        if (!validateDatabase(parsed.database)) {
          return {
            status: 404,
            body: {
              error: {
                code: 404,
                message: `Database ${parsed.database} not found`,
                status: 'NOT_FOUND',
              },
            },
          }
        }

        const currentDoc = store.get(docPath)

        // Check precondition
        if (write.currentDocument) {
          const check = checkPrecondition(currentDoc, write.currentDocument)
          if (!check.satisfied) {
            return {
              status: 400,
              body: {
                error: {
                  code: 400,
                  message: check.error,
                  status: check.status,
                },
              },
            }
          }
        }

        pendingWrites.push({ write, docPath, currentDoc })
      }
    }

    // All preconditions passed - execute writes atomically
    const commitTime = getCurrentTimestamp()
    const writeResults: WriteResult[] = []

    for (const { write, docPath, currentDoc } of pendingWrites) {
      if (write.update) {
        let fields = write.update.fields || {}

        // Apply update mask if provided
        if (write.updateMask) {
          fields = applyUpdateMask(currentDoc?.fields, fields, write.updateMask)
        }

        // Apply transforms if provided
        let transformResults: Value[] | undefined
        if (write.updateTransforms && write.updateTransforms.length > 0) {
          const result = applyFieldTransforms(
            { ...write.update, fields },
            write.updateTransforms
          )
          fields = result.fields
          transformResults = result.transformResults
        }

        const doc: FirestoreDocument = {
          name: docPath,
          fields,
          createTime: currentDoc?.createTime || commitTime,
          updateTime: commitTime,
        }

        store.set(docPath, doc)

        writeResults.push({
          updateTime: commitTime,
          ...(transformResults && transformResults.length > 0 ? { transformResults } : {}),
        })
      } else if (write.delete) {
        store.delete(docPath)
        writeResults.push({ updateTime: commitTime })
      } else if (write.transform) {
        const result = applyFieldTransforms(currentDoc, write.transform.fieldTransforms)

        const doc: FirestoreDocument = {
          name: docPath,
          fields: result.fields,
          createTime: currentDoc?.createTime || commitTime,
          updateTime: commitTime,
        }

        store.set(docPath, doc)

        writeResults.push({
          updateTime: commitTime,
          transformResults: result.transformResults,
        })
      }
    }

    // Mark transaction as committed if applicable
    if (transaction) {
      transaction.committed = true
    }

    return {
      status: 200,
      body: {
        writeResults,
        commitTime,
      },
    }
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: 500,
          message: error instanceof Error ? error.message : 'Internal error',
          status: 'INTERNAL',
        },
      },
    }
  }
}

/**
 * Begin a new transaction
 *
 * @see https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/beginTransaction
 */
export async function beginTransaction(
  request: BeginTransactionRequest
): Promise<{ status: number; body: any }> {
  try {
    const transactionId = generateTransactionId()
    const readOnly = !!(request.options?.readOnly)

    store.createTransaction(transactionId, readOnly)

    return {
      status: 200,
      body: {
        transaction: transactionId,
      },
    }
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: 500,
          message: error instanceof Error ? error.message : 'Internal error',
          status: 'INTERNAL',
        },
      },
    }
  }
}

/**
 * Rollback a transaction
 *
 * @see https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/rollback
 */
export async function rollback(request: RollbackRequest): Promise<{ status: number; body: any }> {
  try {
    if (!request.transaction) {
      return {
        status: 400,
        body: {
          error: {
            code: 400,
            message: 'transaction field is required',
            status: 'INVALID_ARGUMENT',
          },
        },
      }
    }

    const transaction = store.getTransaction(request.transaction)
    if (!transaction) {
      return {
        status: 400,
        body: {
          error: {
            code: 400,
            message: 'Invalid transaction ID',
            status: 'INVALID_ARGUMENT',
          },
        },
      }
    }

    if (transaction.committed) {
      return {
        status: 400,
        body: {
          error: {
            code: 400,
            message: 'Cannot rollback a committed transaction',
            status: 'INVALID_ARGUMENT',
          },
        },
      }
    }

    if (transaction.rolledBack) {
      return {
        status: 400,
        body: {
          error: {
            code: 400,
            message: 'Transaction has already been rolled back',
            status: 'INVALID_ARGUMENT',
          },
        },
      }
    }

    transaction.rolledBack = true

    return {
      status: 200,
      body: {},
    }
  } catch (error) {
    return {
      status: 500,
      body: {
        error: {
          code: 500,
          message: error instanceof Error ? error.message : 'Internal error',
          status: 'INTERNAL',
        },
      },
    }
  }
}
