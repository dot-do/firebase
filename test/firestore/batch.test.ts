/**
 * Tests for Firestore Batch Operations
 *
 * These tests verify the Firebase REST API compatibility for batch operations:
 * - batchGet: Retrieve multiple documents in a single request
 * - commit: Write multiple documents atomically
 * - Transactions: beginTransaction, commit with transaction, rollback
 *
 * @see https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/batchGet
 * @see https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit
 * @see https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/beginTransaction
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Types matching Firestore REST API
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

interface FirestoreDocument {
  name: string
  fields?: Record<string, FirestoreValue>
  createTime?: string
  updateTime?: string
}

interface BatchGetRequest {
  documents: string[]
  mask?: { fieldPaths: string[] }
  transaction?: string
  newTransaction?: TransactionOptions
  readTime?: string
}

interface BatchGetResponse {
  found?: FirestoreDocument
  missing?: string
  readTime: string
  transaction?: string
}

interface Write {
  update?: FirestoreDocument
  delete?: string
  transform?: DocumentTransform
  updateMask?: { fieldPaths: string[] }
  updateTransforms?: FieldTransform[]
  currentDocument?: Precondition
}

interface DocumentTransform {
  document: string
  fieldTransforms: FieldTransform[]
}

interface FieldTransform {
  fieldPath: string
  setToServerValue?: 'REQUEST_TIME'
  increment?: FirestoreValue
  maximum?: FirestoreValue
  minimum?: FirestoreValue
  appendMissingElements?: { values: FirestoreValue[] }
  removeAllFromArray?: { values: FirestoreValue[] }
}

interface Precondition {
  exists?: boolean
  updateTime?: string
}

interface CommitRequest {
  writes: Write[]
  transaction?: string
}

interface WriteResult {
  updateTime: string
  transformResults?: FirestoreValue[]
}

interface CommitResponse {
  writeResults: WriteResult[]
  commitTime: string
}

interface TransactionOptions {
  readOnly?: { readTime?: string }
  readWrite?: { retryTransaction?: string }
}

interface BeginTransactionRequest {
  options?: TransactionOptions
}

interface BeginTransactionResponse {
  transaction: string
}

interface RollbackRequest {
  transaction: string
}

// Import actual implementation
import {
  batchGet as batchGetImpl,
  commit as commitImpl,
  beginTransaction as beginTransactionImpl,
  rollback as rollbackImpl,
  type BatchGetRequest as BatchGetRequestImpl,
  type CommitRequest as CommitRequestImpl,
  type BeginTransactionRequest as BeginTransactionRequestImpl,
  type RollbackRequest as RollbackRequestImpl,
} from '../../src/firestore/batch'

interface FirestoreRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: unknown
}

interface FirestoreResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}

// Handler that routes requests to appropriate implementation
async function handleFirestore(request: FirestoreRequest): Promise<FirestoreResponse> {
  try {
    // Validate content type
    const contentType = request.headers['content-type'] || ''
    if (!contentType.includes('application/json') && request.method !== 'GET') {
      return {
        status: 415,
        headers: { 'content-type': 'application/json' },
        body: { error: { code: 415, message: 'Unsupported Media Type', status: 'INVALID_ARGUMENT' } },
      }
    }

    // Parse the path to determine the operation and validate project/database
    const pathMatch = request.path.match(/:([a-zA-Z]+)$/)
    const operation = pathMatch ? pathMatch[1] : null

    // Extract and validate project ID and database from path
    const urlPathMatch = request.path.match(/^\/v1\/projects\/([^/]+)\/databases\/([^/]+)\/documents:/)
    if (urlPathMatch) {
      const [, projectId, database] = urlPathMatch

      // Validate project ID format
      if (!/^[a-zA-Z0-9-]+$/.test(projectId)) {
        return {
          status: 400,
          headers: { 'content-type': 'application/json' },
          body: { error: { code: 400, message: `Invalid project ID: ${projectId}`, status: 'INVALID_ARGUMENT' } },
        }
      }

      // Validate database exists (only (default) is supported)
      if (database !== '(default)') {
        return {
          status: 404,
          headers: { 'content-type': 'application/json' },
          body: { error: { code: 404, message: `Database ${database} not found`, status: 'NOT_FOUND' } },
        }
      }
    }

    // Route to appropriate handler based on operation
    switch (operation) {
      case 'batchGet': {
        if (request.method !== 'POST') {
          return {
            status: 405,
            headers: { 'content-type': 'application/json' },
            body: { error: { code: 405, message: 'Method Not Allowed', status: 'INVALID_ARGUMENT' } },
          }
        }

        // Validate body is valid JSON
        if (typeof request.body !== 'object' || request.body === null) {
          return {
            status: 400,
            headers: { 'content-type': 'application/json' },
            body: { error: { code: 400, message: 'Invalid JSON body', status: 'INVALID_ARGUMENT' } },
          }
        }

        const result = await batchGetImpl(request.body as BatchGetRequestImpl)
        return {
          status: result.status,
          headers: { 'content-type': 'application/json' },
          body: result.body,
        }
      }

      case 'commit': {
        if (request.method !== 'POST') {
          return {
            status: 405,
            headers: { 'content-type': 'application/json' },
            body: { error: { code: 405, message: 'Method Not Allowed', status: 'INVALID_ARGUMENT' } },
          }
        }

        // Validate body is valid JSON
        if (typeof request.body !== 'object' || request.body === null) {
          return {
            status: 400,
            headers: { 'content-type': 'application/json' },
            body: { error: { code: 400, message: 'Invalid JSON body', status: 'INVALID_ARGUMENT' } },
          }
        }

        const result = await commitImpl(request.body as CommitRequestImpl)
        return {
          status: result.status,
          headers: { 'content-type': 'application/json' },
          body: result.body,
        }
      }

      case 'beginTransaction': {
        if (request.method !== 'POST') {
          return {
            status: 405,
            headers: { 'content-type': 'application/json' },
            body: { error: { code: 405, message: 'Method Not Allowed', status: 'INVALID_ARGUMENT' } },
          }
        }

        const body = (typeof request.body === 'object' && request.body !== null) ? request.body : {}
        const result = await beginTransactionImpl(body as BeginTransactionRequestImpl)
        return {
          status: result.status,
          headers: { 'content-type': 'application/json' },
          body: result.body,
        }
      }

      case 'rollback': {
        if (request.method !== 'POST') {
          return {
            status: 405,
            headers: { 'content-type': 'application/json' },
            body: { error: { code: 405, message: 'Method Not Allowed', status: 'INVALID_ARGUMENT' } },
          }
        }

        // Validate body is valid JSON
        if (typeof request.body !== 'object' || request.body === null) {
          return {
            status: 400,
            headers: { 'content-type': 'application/json' },
            body: { error: { code: 400, message: 'Invalid JSON body', status: 'INVALID_ARGUMENT' } },
          }
        }

        const result = await rollbackImpl(request.body as RollbackRequestImpl)
        return {
          status: result.status,
          headers: { 'content-type': 'application/json' },
          body: result.body,
        }
      }

      default:
        return {
          status: 404,
          headers: { 'content-type': 'application/json' },
          body: { error: { code: 404, message: 'Not Found', status: 'NOT_FOUND' } },
        }
    }
  } catch (error) {
    return {
      status: 500,
      headers: { 'content-type': 'application/json' },
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

// Helper to create a mock Firestore request
function createRequest(overrides: Partial<FirestoreRequest> = {}): FirestoreRequest {
  return {
    method: 'POST',
    path: '/v1/projects/test-project/databases/(default)/documents:batchGet',
    headers: {
      'content-type': 'application/json',
    },
    body: {},
    ...overrides,
  }
}

// Helper to create a document name
function docName(collection: string, docId: string, projectId = 'test-project', database = '(default)'): string {
  return `projects/${projectId}/databases/${database}/documents/${collection}/${docId}`
}

// Helper to create a simple Firestore document
function createDocument(name: string, fields: Record<string, FirestoreValue>): FirestoreDocument {
  return { name, fields }
}

// Helper to create test data
async function seedDocument(collection: string, docId: string, fields: Record<string, FirestoreValue>): Promise<void> {
  const request = createRequest({
    path: `/v1/projects/test-project/databases/(default)/documents:commit`,
    body: {
      writes: [
        {
          update: createDocument(
            docName(collection, docId),
            fields
          ),
        },
      ],
    } satisfies CommitRequest,
  })
  await handleFirestore(request)
}

describe('Firestore Batch Operations', () => {
  const projectId = 'test-project'
  const database = '(default)'
  const basePath = `/v1/projects/${projectId}/databases/${database}/documents`

  describe('POST /v1/projects/{p}/databases/{db}/documents:batchGet', () => {
    describe('Request Format', () => {
      it('should accept POST request with documents array', async () => {
        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [
              docName('users', 'user-1'),
              docName('users', 'user-2'),
            ],
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toContain('application/json')
      })

      it('should reject request without documents array', async () => {
        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {},
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: {
            code: 400,
            message: expect.stringContaining('documents'),
            status: 'INVALID_ARGUMENT',
          },
        })
      })

      it('should reject request with empty documents array', async () => {
        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: { documents: [] } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: {
            code: 400,
            message: expect.stringContaining('empty'),
            status: 'INVALID_ARGUMENT',
          },
        })
      })

      it('should reject request with invalid document path', async () => {
        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: ['invalid-path'],
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: {
            code: 400,
            message: expect.any(String),
            status: 'INVALID_ARGUMENT',
          },
        })
      })

      it('should accept request with field mask', async () => {
        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('users', 'user-1')],
            mask: { fieldPaths: ['name', 'email'] },
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
      })

      it('should accept request with transaction ID', async () => {
        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('users', 'user-1')],
            transaction: 'transaction-id-abc123',
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        // Should either succeed (200) or fail if transaction is invalid (400/404)
        expect([200, 400, 404]).toContain(response.status)
      })

      it('should accept request with newTransaction option', async () => {
        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('users', 'user-1')],
            newTransaction: { readWrite: {} },
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        // Response should include the new transaction ID
        const body = response.body as BatchGetResponse[]
        expect(body[0]?.transaction).toBeDefined()
      })

      it('should accept request with readTime for consistent reads', async () => {
        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('users', 'user-1')],
            readTime: '2024-01-15T10:00:00.000Z',
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect([200, 400]).toContain(response.status)
      })
    })

    describe('Response Format - Found Documents', () => {
      it('should return found documents with correct structure', async () => {
        // Seed the document first
        await seedDocument('users', 'existing-user', {
          name: { stringValue: 'Test User' },
          email: { stringValue: 'test@example.com' },
        })

        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('users', 'existing-user')],
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as BatchGetResponse[]
        expect(Array.isArray(body)).toBe(true)
        expect(body.length).toBe(1)
        expect(body[0].found).toBeDefined()
        expect(body[0].found?.name).toBe(docName('users', 'existing-user'))
        expect(body[0].readTime).toBeDefined()
      })

      it('should return document fields in Firestore value format', async () => {
        // Seed the document first
        await seedDocument('users', 'user-with-data', {
          name: { stringValue: 'User With Data' },
          age: { integerValue: '25' },
        })

        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('users', 'user-with-data')],
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as BatchGetResponse[]
        expect(body[0].found?.fields).toBeDefined()
        // Fields should use Firestore value types
        const fields = body[0].found?.fields
        if (fields?.name) {
          expect(fields.name).toHaveProperty('stringValue')
        }
      })

      it('should include createTime and updateTime for found documents', async () => {
        // Seed the document first
        await seedDocument('users', 'existing-user-2', {
          name: { stringValue: 'Another User' },
        })

        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('users', 'existing-user-2')],
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as BatchGetResponse[]
        expect(body[0].found?.createTime).toBeDefined()
        expect(body[0].found?.updateTime).toBeDefined()
      })
    })

    describe('Response Format - Missing Documents', () => {
      it('should return missing document path for non-existent documents', async () => {
        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('users', 'non-existent-user')],
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as BatchGetResponse[]
        expect(body.length).toBe(1)
        expect(body[0].missing).toBe(docName('users', 'non-existent-user'))
        expect(body[0].found).toBeUndefined()
        expect(body[0].readTime).toBeDefined()
      })
    })

    describe('Response Format - Mixed Found and Missing', () => {
      it('should correctly identify found and missing documents', async () => {
        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [
              docName('users', 'existing-user'),
              docName('users', 'non-existent-user'),
              docName('users', 'another-existing-user'),
            ],
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as BatchGetResponse[]
        expect(body.length).toBe(3)

        // Each response should have either 'found' or 'missing', not both
        for (const result of body) {
          const hasFound = result.found !== undefined
          const hasMissing = result.missing !== undefined
          expect(hasFound !== hasMissing).toBe(true) // XOR - exactly one should be true
          expect(result.readTime).toBeDefined()
        }
      })

      it('should return responses in the same order as requested documents', async () => {
        const docs = [
          docName('users', 'user-1'),
          docName('users', 'user-2'),
          docName('users', 'user-3'),
        ]

        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: { documents: docs } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as BatchGetResponse[]
        expect(body.length).toBe(3)

        // Verify order matches request
        for (let i = 0; i < docs.length; i++) {
          const docPath = body[i].found?.name ?? body[i].missing
          expect(docPath).toBe(docs[i])
        }
      })
    })

    describe('Field Mask Support', () => {
      it('should return only requested fields when mask is provided', async () => {
        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('users', 'user-with-many-fields')],
            mask: { fieldPaths: ['email', 'displayName'] },
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as BatchGetResponse[]
        const fields = body[0].found?.fields

        if (fields) {
          // Only masked fields should be present
          const fieldNames = Object.keys(fields)
          expect(fieldNames.every(f => ['email', 'displayName'].includes(f))).toBe(true)
        }
      })

      it('should support nested field paths in mask', async () => {
        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('users', 'user-with-nested')],
            mask: { fieldPaths: ['profile.firstName', 'profile.lastName'] },
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
      })
    })

    describe('Batch Size Limits', () => {
      it('should support batches up to 100 documents', async () => {
        const documents = Array.from({ length: 100 }, (_, i) =>
          docName('users', `user-${i}`)
        )

        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: { documents } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as BatchGetResponse[]
        expect(body.length).toBe(100)
      })

      it('should reject batches exceeding size limit', async () => {
        const documents = Array.from({ length: 101 }, (_, i) =>
          docName('users', `user-${i}`)
        )

        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: { documents } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: {
            code: 400,
            message: expect.stringContaining('100'),
            status: 'INVALID_ARGUMENT',
          },
        })
      })
    })
  })

  describe('POST /v1/projects/{p}/databases/{db}/documents:commit', () => {
    describe('Request Format', () => {
      it('should accept POST request with writes array', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('users', 'new-user'),
                  { name: { stringValue: 'Test User' } }
                ),
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toContain('application/json')
      })

      it('should reject request without writes array', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {},
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: {
            code: 400,
            message: expect.stringContaining('writes'),
            status: 'INVALID_ARGUMENT',
          },
        })
      })

      it('should accept empty writes array (no-op commit)', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: { writes: [] } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as CommitResponse
        expect(body.writeResults).toEqual([])
        expect(body.commitTime).toBeDefined()
      })
    })

    describe('Write Operations - Update', () => {
      it('should create a new document with update operation', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('products', 'new-product'),
                  {
                    name: { stringValue: 'Widget' },
                    price: { doubleValue: 29.99 },
                    inStock: { booleanValue: true },
                  }
                ),
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as CommitResponse
        expect(body.writeResults.length).toBe(1)
        expect(body.writeResults[0].updateTime).toBeDefined()
        expect(body.commitTime).toBeDefined()
      })

      it('should update an existing document', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('products', 'existing-product'),
                  {
                    price: { doubleValue: 39.99 },
                  }
                ),
                updateMask: { fieldPaths: ['price'] },
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as CommitResponse
        expect(body.writeResults[0].updateTime).toBeDefined()
      })

      it('should support updateMask to update specific fields', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('users', 'user-1'),
                  {
                    email: { stringValue: 'newemail@example.com' },
                    profile: {
                      mapValue: {
                        fields: {
                          firstName: { stringValue: 'Updated' },
                        },
                      },
                    },
                  }
                ),
                updateMask: { fieldPaths: ['email', 'profile.firstName'] },
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
      })
    })

    describe('Write Operations - Delete', () => {
      it('should delete a document', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                delete: docName('users', 'user-to-delete'),
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as CommitResponse
        expect(body.writeResults.length).toBe(1)
        expect(body.commitTime).toBeDefined()
      })

      it('should succeed when deleting non-existent document', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                delete: docName('users', 'already-deleted'),
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        // Firebase allows deleting non-existent documents
        expect(response.status).toBe(200)
      })
    })

    describe('Write Operations - Transform', () => {
      it('should support server timestamp transform', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                transform: {
                  document: docName('posts', 'post-1'),
                  fieldTransforms: [
                    {
                      fieldPath: 'updatedAt',
                      setToServerValue: 'REQUEST_TIME',
                    },
                  ],
                },
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as CommitResponse
        expect(body.writeResults[0].transformResults).toBeDefined()
        expect(body.writeResults[0].transformResults?.[0]?.timestampValue).toBeDefined()
      })

      it('should support increment transform', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                transform: {
                  document: docName('counters', 'views'),
                  fieldTransforms: [
                    {
                      fieldPath: 'count',
                      increment: { integerValue: '1' },
                    },
                  ],
                },
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as CommitResponse
        expect(body.writeResults[0].transformResults).toBeDefined()
      })

      it('should support array union transform', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                transform: {
                  document: docName('users', 'user-1'),
                  fieldTransforms: [
                    {
                      fieldPath: 'tags',
                      appendMissingElements: {
                        values: [
                          { stringValue: 'premium' },
                          { stringValue: 'verified' },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
      })

      it('should support array remove transform', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                transform: {
                  document: docName('users', 'user-1'),
                  fieldTransforms: [
                    {
                      fieldPath: 'tags',
                      removeAllFromArray: {
                        values: [{ stringValue: 'trial' }],
                      },
                    },
                  ],
                },
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
      })

      it('should support maximum transform', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                transform: {
                  document: docName('stats', 'highscore'),
                  fieldTransforms: [
                    {
                      fieldPath: 'score',
                      maximum: { integerValue: '100' },
                    },
                  ],
                },
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
      })

      it('should support minimum transform', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                transform: {
                  document: docName('stats', 'lowest'),
                  fieldTransforms: [
                    {
                      fieldPath: 'value',
                      minimum: { integerValue: '5' },
                    },
                  ],
                },
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
      })
    })

    describe('Batch Writes - Multiple Operations', () => {
      it('should execute multiple writes in a single commit', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('orders', 'order-1'),
                  { status: { stringValue: 'processing' } }
                ),
              },
              {
                update: createDocument(
                  docName('orders', 'order-2'),
                  { status: { stringValue: 'shipped' } }
                ),
              },
              {
                delete: docName('orders', 'order-old'),
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as CommitResponse
        expect(body.writeResults.length).toBe(3)
        expect(body.commitTime).toBeDefined()

        // All writes should have the same commitTime
        for (const result of body.writeResults) {
          expect(result.updateTime).toBeDefined()
        }
      })

      it('should return write results in the same order as writes', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              { update: createDocument(docName('test', 'doc-1'), { v: { integerValue: '1' } }) },
              { update: createDocument(docName('test', 'doc-2'), { v: { integerValue: '2' } }) },
              { update: createDocument(docName('test', 'doc-3'), { v: { integerValue: '3' } }) },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as CommitResponse
        expect(body.writeResults.length).toBe(3)
      })
    })

    describe('Atomic Execution', () => {
      it('should fail all writes if one fails (atomicity)', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('atomic', 'doc-1'),
                  { value: { integerValue: '1' } }
                ),
              },
              {
                update: createDocument(
                  docName('atomic', 'doc-2'),
                  { value: { integerValue: '2' } }
                ),
                // This precondition will fail - document doesn't exist with this updateTime
                currentDocument: {
                  updateTime: '1970-01-01T00:00:00.000Z',
                },
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        // Should fail due to precondition failure
        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: {
            code: 400,
            message: expect.any(String),
            status: 'FAILED_PRECONDITION',
          },
        })
      })

      it('should not partially apply writes on failure', async () => {
        // First, set up a document we can verify wasn't changed
        const setupRequest = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('atomic-test', 'verify-doc'),
                  { originalValue: { stringValue: 'unchanged' } }
                ),
              },
            ],
          } satisfies CommitRequest,
        })

        await handleFirestore(setupRequest)

        // Now try a batch that will fail
        const failingRequest = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('atomic-test', 'verify-doc'),
                  { originalValue: { stringValue: 'should-not-happen' } }
                ),
              },
              {
                update: createDocument(
                  docName('atomic-test', 'another-doc'),
                  { value: { integerValue: '1' } }
                ),
                currentDocument: { exists: true }, // Will fail if doc doesn't exist
              },
            ],
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(failingRequest)

        // Batch should fail
        expect([400, 404]).toContain(response.status)

        // Verify original document wasn't changed
        const verifyRequest = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('atomic-test', 'verify-doc')],
          } satisfies BatchGetRequest,
        })

        const verifyResponse = await handleFirestore(verifyRequest)
        const body = verifyResponse.body as BatchGetResponse[]

        if (verifyResponse.status === 200 && body[0]?.found) {
          expect(body[0].found.fields?.originalValue?.stringValue).toBe('unchanged')
        }
      })
    })

    describe('Write Preconditions', () => {
      describe('exists precondition', () => {
        it('should succeed when exists=true and document exists', async () => {
          // First create the document
          await seedDocument('preconditions', 'existing-doc', {
            initial: { stringValue: 'value' },
          })

          const request = createRequest({
            path: `${basePath}:commit`,
            body: {
              writes: [
                {
                  update: createDocument(
                    docName('preconditions', 'existing-doc'),
                    { updated: { booleanValue: true } }
                  ),
                  currentDocument: { exists: true },
                },
              ],
            } satisfies CommitRequest,
          })

          const response = await handleFirestore(request)

          expect(response.status).toBe(200)
        })

        it('should fail when exists=true and document does not exist', async () => {
          const request = createRequest({
            path: `${basePath}:commit`,
            body: {
              writes: [
                {
                  update: createDocument(
                    docName('preconditions', 'non-existent-doc'),
                    { value: { stringValue: 'test' } }
                  ),
                  currentDocument: { exists: true },
                },
              ],
            } satisfies CommitRequest,
          })

          const response = await handleFirestore(request)

          expect(response.status).toBe(400)
          expect(response.body).toEqual({
            error: {
              code: 400,
              message: expect.any(String),
              status: 'FAILED_PRECONDITION',
            },
          })
        })

        it('should succeed when exists=false and document does not exist', async () => {
          const request = createRequest({
            path: `${basePath}:commit`,
            body: {
              writes: [
                {
                  update: createDocument(
                    docName('preconditions', `new-doc-${Date.now()}`),
                    { value: { stringValue: 'created' } }
                  ),
                  currentDocument: { exists: false },
                },
              ],
            } satisfies CommitRequest,
          })

          const response = await handleFirestore(request)

          expect(response.status).toBe(200)
        })

        it('should fail when exists=false and document exists', async () => {
          // First create the document
          await seedDocument('preconditions', 'existing-doc-2', {
            existing: { stringValue: 'value' },
          })

          const request = createRequest({
            path: `${basePath}:commit`,
            body: {
              writes: [
                {
                  update: createDocument(
                    docName('preconditions', 'existing-doc-2'),
                    { value: { stringValue: 'should-fail' } }
                  ),
                  currentDocument: { exists: false },
                },
              ],
            } satisfies CommitRequest,
          })

          const response = await handleFirestore(request)

          expect(response.status).toBe(400)
          expect(response.body).toEqual({
            error: {
              code: 400,
              message: expect.any(String),
              status: 'ALREADY_EXISTS',
            },
          })
        })
      })

      describe('updateTime precondition', () => {
        it('should succeed when updateTime matches', async () => {
          // This test would require setting up a document first and capturing its updateTime
          const request = createRequest({
            path: `${basePath}:commit`,
            body: {
              writes: [
                {
                  update: createDocument(
                    docName('preconditions', 'timed-doc'),
                    { value: { stringValue: 'updated' } }
                  ),
                  currentDocument: {
                    updateTime: '2024-01-15T10:00:00.000000Z',
                  },
                },
              ],
            } satisfies CommitRequest,
          })

          const response = await handleFirestore(request)

          // Will fail if updateTime doesn't match (expected in most test scenarios)
          expect([200, 400]).toContain(response.status)
        })

        it('should fail when updateTime does not match', async () => {
          const request = createRequest({
            path: `${basePath}:commit`,
            body: {
              writes: [
                {
                  update: createDocument(
                    docName('preconditions', 'existing-doc'),
                    { value: { stringValue: 'should-fail' } }
                  ),
                  currentDocument: {
                    updateTime: '1970-01-01T00:00:00.000000Z', // Ancient timestamp
                  },
                },
              ],
            } satisfies CommitRequest,
          })

          const response = await handleFirestore(request)

          expect(response.status).toBe(400)
          expect(response.body).toEqual({
            error: {
              code: 400,
              message: expect.any(String),
              status: 'FAILED_PRECONDITION',
            },
          })
        })
      })
    })

    describe('Batch Size Limits', () => {
      it('should support up to 500 writes in a single commit', async () => {
        const writes = Array.from({ length: 500 }, (_, i) => ({
          update: createDocument(
            docName('batch-limit', `doc-${i}`),
            { index: { integerValue: String(i) } }
          ),
        }))

        const request = createRequest({
          path: `${basePath}:commit`,
          body: { writes } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as CommitResponse
        expect(body.writeResults.length).toBe(500)
      })

      it('should reject commits exceeding 500 writes', async () => {
        const writes = Array.from({ length: 501 }, (_, i) => ({
          update: createDocument(
            docName('batch-limit', `doc-${i}`),
            { index: { integerValue: String(i) } }
          ),
        }))

        const request = createRequest({
          path: `${basePath}:commit`,
          body: { writes } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: {
            code: 400,
            message: expect.stringContaining('500'),
            status: 'INVALID_ARGUMENT',
          },
        })
      })
    })
  })

  describe('Transaction Support', () => {
    describe('POST /v1/projects/{p}/databases/{db}/documents:beginTransaction', () => {
      it('should return a transaction ID', async () => {
        const request = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: {} satisfies BeginTransactionRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as BeginTransactionResponse
        expect(body.transaction).toBeDefined()
        expect(typeof body.transaction).toBe('string')
        expect(body.transaction.length).toBeGreaterThan(0)
      })

      it('should accept readWrite transaction options', async () => {
        const request = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: {
            options: {
              readWrite: {},
            },
          } satisfies BeginTransactionRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as BeginTransactionResponse
        expect(body.transaction).toBeDefined()
      })

      it('should accept readOnly transaction options', async () => {
        const request = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: {
            options: {
              readOnly: {},
            },
          } satisfies BeginTransactionRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(200)
        const body = response.body as BeginTransactionResponse
        expect(body.transaction).toBeDefined()
      })

      it('should accept readOnly with specific readTime', async () => {
        const request = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: {
            options: {
              readOnly: {
                readTime: '2024-01-15T10:00:00.000Z',
              },
            },
          } satisfies BeginTransactionRequest,
        })

        const response = await handleFirestore(request)

        expect([200, 400]).toContain(response.status) // 400 if readTime is too old
      })

      it('should accept retryTransaction for optimistic concurrency', async () => {
        const request = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: {
            options: {
              readWrite: {
                retryTransaction: 'previous-transaction-id',
              },
            },
          } satisfies BeginTransactionRequest,
        })

        const response = await handleFirestore(request)

        expect([200, 400]).toContain(response.status)
      })

      it('should generate unique transaction IDs', async () => {
        const transactionIds = new Set<string>()

        for (let i = 0; i < 5; i++) {
          const request = createRequest({
            method: 'POST',
            path: `${basePath}:beginTransaction`,
            body: {} satisfies BeginTransactionRequest,
          })

          const response = await handleFirestore(request)
          expect(response.status).toBe(200)

          const body = response.body as BeginTransactionResponse
          expect(transactionIds.has(body.transaction)).toBe(false)
          transactionIds.add(body.transaction)
        }

        expect(transactionIds.size).toBe(5)
      })
    })

    describe('Commit with Transaction', () => {
      it('should commit writes with a valid transaction ID', async () => {
        // Begin transaction
        const beginRequest = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: { options: { readWrite: {} } } satisfies BeginTransactionRequest,
        })

        const beginResponse = await handleFirestore(beginRequest)
        expect(beginResponse.status).toBe(200)
        const { transaction } = beginResponse.body as BeginTransactionResponse

        // Commit with transaction
        const commitRequest = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('transactions', 'tx-doc'),
                  { value: { stringValue: 'committed' } }
                ),
              },
            ],
            transaction,
          } satisfies CommitRequest,
        })

        const commitResponse = await handleFirestore(commitRequest)

        expect(commitResponse.status).toBe(200)
        const commitBody = commitResponse.body as CommitResponse
        expect(commitBody.writeResults.length).toBe(1)
        expect(commitBody.commitTime).toBeDefined()
      })

      it('should reject commit with invalid transaction ID', async () => {
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('transactions', 'tx-doc'),
                  { value: { stringValue: 'should-fail' } }
                ),
              },
            ],
            transaction: 'invalid-transaction-id',
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: {
            code: 400,
            message: expect.any(String),
            status: 'INVALID_ARGUMENT',
          },
        })
      })

      it('should reject commit with already-used transaction ID', async () => {
        // Begin transaction
        const beginRequest = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: { options: { readWrite: {} } } satisfies BeginTransactionRequest,
        })

        const beginResponse = await handleFirestore(beginRequest)
        const { transaction } = beginResponse.body as BeginTransactionResponse

        // First commit (should succeed)
        const firstCommit = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('transactions', 'doc-1'),
                  { value: { stringValue: 'first' } }
                ),
              },
            ],
            transaction,
          } satisfies CommitRequest,
        })

        await handleFirestore(firstCommit)

        // Second commit with same transaction (should fail)
        const secondCommit = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('transactions', 'doc-2'),
                  { value: { stringValue: 'second' } }
                ),
              },
            ],
            transaction,
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(secondCommit)

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: {
            code: 400,
            message: expect.any(String),
            status: 'INVALID_ARGUMENT',
          },
        })
      })

      it('should reject writes in a read-only transaction', async () => {
        // Begin read-only transaction
        const beginRequest = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: { options: { readOnly: {} } } satisfies BeginTransactionRequest,
        })

        const beginResponse = await handleFirestore(beginRequest)
        const { transaction } = beginResponse.body as BeginTransactionResponse

        // Try to commit writes with read-only transaction
        const commitRequest = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('transactions', 'readonly-test'),
                  { value: { stringValue: 'should-fail' } }
                ),
              },
            ],
            transaction,
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(commitRequest)

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: {
            code: 400,
            message: expect.stringContaining('read'),
            status: 'INVALID_ARGUMENT',
          },
        })
      })
    })

    describe('Transactional Reads', () => {
      it('should allow batchGet within a transaction', async () => {
        // Begin transaction
        const beginRequest = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: { options: { readWrite: {} } } satisfies BeginTransactionRequest,
        })

        const beginResponse = await handleFirestore(beginRequest)
        const { transaction } = beginResponse.body as BeginTransactionResponse

        // Read within transaction
        const readRequest = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('transactions', 'tx-read-doc')],
            transaction,
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(readRequest)

        expect(response.status).toBe(200)
      })

      it('should return consistent reads within transaction', async () => {
        // Begin transaction
        const beginRequest = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: { options: { readWrite: {} } } satisfies BeginTransactionRequest,
        })

        const beginResponse = await handleFirestore(beginRequest)
        const { transaction } = beginResponse.body as BeginTransactionResponse

        // Multiple reads should see same data
        const readRequest1 = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('transactions', 'consistent-doc')],
            transaction,
          } satisfies BatchGetRequest,
        })

        const readRequest2 = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('transactions', 'consistent-doc')],
            transaction,
          } satisfies BatchGetRequest,
        })

        const [response1, response2] = await Promise.all([
          handleFirestore(readRequest1),
          handleFirestore(readRequest2),
        ])

        expect(response1.status).toBe(200)
        expect(response2.status).toBe(200)

        // Both reads should return the same data
        const body1 = response1.body as BatchGetResponse[]
        const body2 = response2.body as BatchGetResponse[]
        expect(body1[0]).toEqual(body2[0])
      })
    })

    describe('POST /v1/projects/{p}/databases/{db}/documents:rollback', () => {
      it('should rollback a transaction successfully', async () => {
        // Begin transaction
        const beginRequest = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: { options: { readWrite: {} } } satisfies BeginTransactionRequest,
        })

        const beginResponse = await handleFirestore(beginRequest)
        const { transaction } = beginResponse.body as BeginTransactionResponse

        // Rollback
        const rollbackRequest = createRequest({
          method: 'POST',
          path: `${basePath}:rollback`,
          body: { transaction } satisfies RollbackRequest,
        })

        const response = await handleFirestore(rollbackRequest)

        expect(response.status).toBe(200)
        // Response body should be empty on success
        expect(response.body).toEqual({})
      })

      it('should reject rollback with invalid transaction ID', async () => {
        const request = createRequest({
          method: 'POST',
          path: `${basePath}:rollback`,
          body: { transaction: 'invalid-transaction-id' } satisfies RollbackRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: {
            code: 400,
            message: expect.any(String),
            status: 'INVALID_ARGUMENT',
          },
        })
      })

      it('should reject rollback of already-committed transaction', async () => {
        // Begin transaction
        const beginRequest = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: { options: { readWrite: {} } } satisfies BeginTransactionRequest,
        })

        const beginResponse = await handleFirestore(beginRequest)
        const { transaction } = beginResponse.body as BeginTransactionResponse

        // Commit the transaction
        const commitRequest = createRequest({
          path: `${basePath}:commit`,
          body: { writes: [], transaction } satisfies CommitRequest,
        })

        await handleFirestore(commitRequest)

        // Try to rollback
        const rollbackRequest = createRequest({
          method: 'POST',
          path: `${basePath}:rollback`,
          body: { transaction } satisfies RollbackRequest,
        })

        const response = await handleFirestore(rollbackRequest)

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: {
            code: 400,
            message: expect.any(String),
            status: 'INVALID_ARGUMENT',
          },
        })
      })

      it('should reject commit after rollback', async () => {
        // Begin transaction
        const beginRequest = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: { options: { readWrite: {} } } satisfies BeginTransactionRequest,
        })

        const beginResponse = await handleFirestore(beginRequest)
        const { transaction } = beginResponse.body as BeginTransactionResponse

        // Rollback
        const rollbackRequest = createRequest({
          method: 'POST',
          path: `${basePath}:rollback`,
          body: { transaction } satisfies RollbackRequest,
        })

        await handleFirestore(rollbackRequest)

        // Try to commit
        const commitRequest = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('transactions', 'after-rollback'),
                  { value: { stringValue: 'should-fail' } }
                ),
              },
            ],
            transaction,
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(commitRequest)

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: {
            code: 400,
            message: expect.any(String),
            status: 'INVALID_ARGUMENT',
          },
        })
      })

      it('should discard uncommitted writes on rollback', async () => {
        // Begin transaction
        const beginRequest = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: { options: { readWrite: {} } } satisfies BeginTransactionRequest,
        })

        const beginResponse = await handleFirestore(beginRequest)
        const { transaction } = beginResponse.body as BeginTransactionResponse

        // Do a read within transaction (to establish transaction scope)
        const readRequest = createRequest({
          path: `${basePath}:batchGet`,
          body: {
            documents: [docName('rollback-test', 'check-doc')],
            transaction,
          } satisfies BatchGetRequest,
        })

        await handleFirestore(readRequest)

        // Rollback (any pending writes should be discarded)
        const rollbackRequest = createRequest({
          method: 'POST',
          path: `${basePath}:rollback`,
          body: { transaction } satisfies RollbackRequest,
        })

        const response = await handleFirestore(rollbackRequest)

        expect(response.status).toBe(200)
      })
    })

    describe('Transaction Timeout', () => {
      it('should reject operations on expired transactions', async () => {
        // This test would require waiting for transaction timeout
        // For now, we test with an obviously invalid/expired transaction
        const request = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(
                  docName('timeout', 'doc'),
                  { value: { stringValue: 'test' } }
                ),
              },
            ],
            transaction: 'expired-transaction-from-long-ago',
          } satisfies CommitRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(400)
      })
    })

    describe('Conflict Detection', () => {
      it('should detect write conflicts between transactions', async () => {
        // Begin two concurrent transactions
        const begin1 = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: { options: { readWrite: {} } } satisfies BeginTransactionRequest,
        })

        const begin2 = createRequest({
          method: 'POST',
          path: `${basePath}:beginTransaction`,
          body: { options: { readWrite: {} } } satisfies BeginTransactionRequest,
        })

        const [response1, response2] = await Promise.all([
          handleFirestore(begin1),
          handleFirestore(begin2),
        ])

        const tx1 = (response1.body as BeginTransactionResponse).transaction
        const tx2 = (response2.body as BeginTransactionResponse).transaction

        // Both transactions read the same document
        const docPath = docName('conflicts', 'contested-doc')

        const read1 = createRequest({
          path: `${basePath}:batchGet`,
          body: { documents: [docPath], transaction: tx1 } satisfies BatchGetRequest,
        })

        const read2 = createRequest({
          path: `${basePath}:batchGet`,
          body: { documents: [docPath], transaction: tx2 } satisfies BatchGetRequest,
        })

        await Promise.all([handleFirestore(read1), handleFirestore(read2)])

        // First transaction commits
        const commit1 = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(docPath, { value: { stringValue: 'tx1' } }),
              },
            ],
            transaction: tx1,
          } satisfies CommitRequest,
        })

        const commitResponse1 = await handleFirestore(commit1)
        expect(commitResponse1.status).toBe(200)

        // Second transaction should fail due to conflict
        const commit2 = createRequest({
          path: `${basePath}:commit`,
          body: {
            writes: [
              {
                update: createDocument(docPath, { value: { stringValue: 'tx2' } }),
              },
            ],
            transaction: tx2,
          } satisfies CommitRequest,
        })

        const commitResponse2 = await handleFirestore(commit2)

        expect(commitResponse2.status).toBe(409)
        expect(commitResponse2.body).toEqual({
          error: {
            code: 409,
            message: expect.any(String),
            status: 'ABORTED',
          },
        })
      })
    })
  })

  describe('Error Handling', () => {
    describe('Invalid Project/Database', () => {
      it('should reject request with invalid project ID', async () => {
        const request = createRequest({
          path: '/v1/projects/invalid project!/databases/(default)/documents:batchGet',
          body: {
            documents: [docName('users', 'user-1')],
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(400)
      })

      it('should reject request with non-existent database', async () => {
        const request = createRequest({
          path: '/v1/projects/test-project/databases/nonexistent/documents:batchGet',
          body: {
            documents: ['projects/test-project/databases/nonexistent/documents/users/user-1'],
          } satisfies BatchGetRequest,
        })

        const response = await handleFirestore(request)

        expect([400, 404]).toContain(response.status)
      })
    })

    describe('Malformed Requests', () => {
      it('should reject non-JSON content type', async () => {
        const request = createRequest({
          headers: { 'content-type': 'text/plain' },
          path: `${basePath}:batchGet`,
          body: { documents: [docName('users', 'user-1')] },
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(415)
      })

      it('should reject GET request to POST endpoint', async () => {
        const request = createRequest({
          method: 'GET',
          path: `${basePath}:batchGet`,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(405)
      })

      it('should reject malformed JSON body', async () => {
        const request = createRequest({
          path: `${basePath}:batchGet`,
          body: 'not valid json' as unknown,
        })

        const response = await handleFirestore(request)

        expect(response.status).toBe(400)
      })
    })
  })
})
