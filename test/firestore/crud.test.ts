import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import './setup' // Start/stop server

/**
 * Firestore REST API Document CRUD Tests
 *
 * These tests verify the Firestore REST API format for document operations
 * as specified in: https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents
 */

const BASE_URL = process.env.FIRESTORE_URL || 'http://localhost:8080'
const PROJECT_ID = 'test-project'
const DATABASE_ID = '(default)'

// Helper to construct document path
function documentPath(collection: string, docId: string, ...subcollections: string[]): string {
  let path = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${collection}/${docId}`
  for (let i = 0; i < subcollections.length; i += 2) {
    path += `/${subcollections[i]}/${subcollections[i + 1]}`
  }
  return path
}

// Helper to construct API URL
function apiUrl(collection: string, docId: string, ...subcollections: string[]): string {
  let path = `/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${collection}/${docId}`
  for (let i = 0; i < subcollections.length; i += 2) {
    path += `/${subcollections[i]}/${subcollections[i + 1]}`
  }
  return `${BASE_URL}${path}`
}

// Firestore field value types
interface FirestoreValue {
  stringValue?: string
  integerValue?: string
  doubleValue?: number
  booleanValue?: boolean
  nullValue?: null
  timestampValue?: string
  bytesValue?: string
  referenceValue?: string
  geoPointValue?: { latitude: number; longitude: number }
  arrayValue?: { values?: FirestoreValue[] }
  mapValue?: { fields?: Record<string, FirestoreValue> }
}

interface FirestoreDocument {
  name: string
  fields?: Record<string, FirestoreValue>
  createTime?: string
  updateTime?: string
}

interface FirestoreError {
  error: {
    code: number
    message: string
    status: string
  }
}

describe('Firestore Document CRUD Operations', () => {
  const testCollection = 'test-crud-collection'
  const testDocId = 'test-doc-' + Date.now()

  describe('GET /v1/projects/{project}/databases/{db}/documents/{collection}/{docId}', () => {
    it('should return 404 for non-existent document', async () => {
      const response = await fetch(apiUrl(testCollection, 'non-existent-doc'))

      expect(response.status).toBe(404)

      const body: FirestoreError = await response.json()
      expect(body.error).toBeDefined()
      expect(body.error.code).toBe(404)
      expect(body.error.status).toBe('NOT_FOUND')
    })

    it('should return document with correct format after creation', async () => {
      // First create a document
      const createResponse = await fetch(apiUrl(testCollection, testDocId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            title: { stringValue: 'Test Document' },
            count: { integerValue: '42' },
          },
        }),
      })
      expect(createResponse.status).toBe(200)

      // Then fetch it
      const response = await fetch(apiUrl(testCollection, testDocId))

      expect(response.status).toBe(200)

      const doc: FirestoreDocument = await response.json()

      // Verify document name format
      expect(doc.name).toBe(documentPath(testCollection, testDocId))

      // Verify fields exist
      expect(doc.fields).toBeDefined()
      expect(doc.fields?.title?.stringValue).toBe('Test Document')
      expect(doc.fields?.count?.integerValue).toBe('42')

      // Verify timestamps
      expect(doc.createTime).toBeDefined()
      expect(doc.updateTime).toBeDefined()
      expect(new Date(doc.createTime!).getTime()).toBeGreaterThan(0)
      expect(new Date(doc.updateTime!).getTime()).toBeGreaterThan(0)
    })

    it('should support field mask to return only specific fields', async () => {
      // Create document with multiple fields
      await fetch(apiUrl(testCollection, 'field-mask-doc'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            field1: { stringValue: 'value1' },
            field2: { stringValue: 'value2' },
            field3: { stringValue: 'value3' },
          },
        }),
      })

      // Fetch with field mask
      const response = await fetch(
        apiUrl(testCollection, 'field-mask-doc') + '?mask.fieldPaths=field1&mask.fieldPaths=field3'
      )

      expect(response.status).toBe(200)

      const doc: FirestoreDocument = await response.json()
      expect(doc.fields?.field1?.stringValue).toBe('value1')
      expect(doc.fields?.field3?.stringValue).toBe('value3')
      expect(doc.fields?.field2).toBeUndefined()
    })
  })

  describe('PATCH /v1/projects/{project}/databases/{db}/documents/{collection}/{docId}', () => {
    it('should create a new document', async () => {
      const docId = 'create-test-' + Date.now()

      const response = await fetch(apiUrl(testCollection, docId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            name: { stringValue: 'New Document' },
            active: { booleanValue: true },
          },
        }),
      })

      expect(response.status).toBe(200)

      const doc: FirestoreDocument = await response.json()
      expect(doc.name).toBe(documentPath(testCollection, docId))
      expect(doc.fields?.name?.stringValue).toBe('New Document')
      expect(doc.fields?.active?.booleanValue).toBe(true)
      expect(doc.createTime).toBeDefined()
      expect(doc.updateTime).toBeDefined()
    })

    it('should update an existing document', async () => {
      const docId = 'update-test-' + Date.now()

      // Create
      const createResponse = await fetch(apiUrl(testCollection, docId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            version: { integerValue: '1' },
          },
        }),
      })
      const createdDoc: FirestoreDocument = await createResponse.json()
      const originalUpdateTime = createdDoc.updateTime

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Update
      const updateResponse = await fetch(apiUrl(testCollection, docId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            version: { integerValue: '2' },
            newField: { stringValue: 'added' },
          },
        }),
      })

      expect(updateResponse.status).toBe(200)

      const updatedDoc: FirestoreDocument = await updateResponse.json()
      expect(updatedDoc.fields?.version?.integerValue).toBe('2')
      expect(updatedDoc.fields?.newField?.stringValue).toBe('added')
      expect(updatedDoc.createTime).toBe(createdDoc.createTime)
      expect(updatedDoc.updateTime).not.toBe(originalUpdateTime)
    })

    it('should support updateMask to update only specific fields', async () => {
      const docId = 'update-mask-test-' + Date.now()

      // Create document
      await fetch(apiUrl(testCollection, docId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            field1: { stringValue: 'original1' },
            field2: { stringValue: 'original2' },
            field3: { stringValue: 'original3' },
          },
        }),
      })

      // Update with mask - only update field2
      const response = await fetch(
        apiUrl(testCollection, docId) + '?updateMask.fieldPaths=field2',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              field2: { stringValue: 'updated2' },
            },
          }),
        }
      )

      expect(response.status).toBe(200)

      const doc: FirestoreDocument = await response.json()
      expect(doc.fields?.field1?.stringValue).toBe('original1')
      expect(doc.fields?.field2?.stringValue).toBe('updated2')
      expect(doc.fields?.field3?.stringValue).toBe('original3')
    })
  })

  describe('DELETE /v1/projects/{project}/databases/{db}/documents/{collection}/{docId}', () => {
    it('should delete an existing document', async () => {
      const docId = 'delete-test-' + Date.now()

      // Create document first
      await fetch(apiUrl(testCollection, docId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { temp: { booleanValue: true } },
        }),
      })

      // Delete it
      const deleteResponse = await fetch(apiUrl(testCollection, docId), {
        method: 'DELETE',
      })

      expect(deleteResponse.status).toBe(200)

      // Verify it's gone
      const getResponse = await fetch(apiUrl(testCollection, docId))
      expect(getResponse.status).toBe(404)
    })

    it('should return 404 when deleting non-existent document', async () => {
      const response = await fetch(apiUrl(testCollection, 'non-existent-delete'), {
        method: 'DELETE',
      })

      // Firestore REST API returns 404 for deleting non-existent documents
      // when preconditions require existence
      expect(response.status).toBe(404)
    })
  })

  describe('Field Value Encoding', () => {
    const fieldTestDocId = 'field-types-' + Date.now()

    it('should handle stringValue correctly', async () => {
      const response = await fetch(apiUrl(testCollection, fieldTestDocId + '-string'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            text: { stringValue: 'Hello, World!' },
            empty: { stringValue: '' },
            unicode: { stringValue: '日本語 emoji: 🔥' },
          },
        }),
      })

      expect(response.status).toBe(200)
      const doc: FirestoreDocument = await response.json()
      expect(doc.fields?.text?.stringValue).toBe('Hello, World!')
      expect(doc.fields?.empty?.stringValue).toBe('')
      expect(doc.fields?.unicode?.stringValue).toBe('日本語 emoji: 🔥')
    })

    it('should handle integerValue correctly', async () => {
      const response = await fetch(apiUrl(testCollection, fieldTestDocId + '-integer'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            positive: { integerValue: '12345' },
            negative: { integerValue: '-9999' },
            zero: { integerValue: '0' },
            large: { integerValue: '9007199254740991' }, // MAX_SAFE_INTEGER
          },
        }),
      })

      expect(response.status).toBe(200)
      const doc: FirestoreDocument = await response.json()
      expect(doc.fields?.positive?.integerValue).toBe('12345')
      expect(doc.fields?.negative?.integerValue).toBe('-9999')
      expect(doc.fields?.zero?.integerValue).toBe('0')
      expect(doc.fields?.large?.integerValue).toBe('9007199254740991')
    })

    it('should handle doubleValue correctly', async () => {
      const response = await fetch(apiUrl(testCollection, fieldTestDocId + '-double'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            pi: { doubleValue: 3.14159 },
            negative: { doubleValue: -273.15 },
            zero: { doubleValue: 0.0 },
          },
        }),
      })

      expect(response.status).toBe(200)
      const doc: FirestoreDocument = await response.json()
      expect(doc.fields?.pi?.doubleValue).toBeCloseTo(3.14159)
      expect(doc.fields?.negative?.doubleValue).toBeCloseTo(-273.15)
      expect(doc.fields?.zero?.doubleValue).toBe(0)
    })

    it('should handle booleanValue correctly', async () => {
      const response = await fetch(apiUrl(testCollection, fieldTestDocId + '-boolean'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            truthy: { booleanValue: true },
            falsy: { booleanValue: false },
          },
        }),
      })

      expect(response.status).toBe(200)
      const doc: FirestoreDocument = await response.json()
      expect(doc.fields?.truthy?.booleanValue).toBe(true)
      expect(doc.fields?.falsy?.booleanValue).toBe(false)
    })

    it('should handle nullValue correctly', async () => {
      const response = await fetch(apiUrl(testCollection, fieldTestDocId + '-null'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            nothing: { nullValue: null },
          },
        }),
      })

      expect(response.status).toBe(200)
      const doc: FirestoreDocument = await response.json()
      expect(doc.fields?.nothing?.nullValue).toBe(null)
    })

    it('should handle timestampValue correctly', async () => {
      const timestamp = '2024-01-15T10:30:00.000Z'

      const response = await fetch(apiUrl(testCollection, fieldTestDocId + '-timestamp'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            createdAt: { timestampValue: timestamp },
          },
        }),
      })

      expect(response.status).toBe(200)
      const doc: FirestoreDocument = await response.json()
      expect(doc.fields?.createdAt?.timestampValue).toBe(timestamp)
    })

    it('should handle bytesValue correctly', async () => {
      const base64Data = 'SGVsbG8gV29ybGQh' // "Hello World!" in base64

      const response = await fetch(apiUrl(testCollection, fieldTestDocId + '-bytes'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            data: { bytesValue: base64Data },
          },
        }),
      })

      expect(response.status).toBe(200)
      const doc: FirestoreDocument = await response.json()
      expect(doc.fields?.data?.bytesValue).toBe(base64Data)
    })

    it('should handle geoPointValue correctly', async () => {
      const response = await fetch(apiUrl(testCollection, fieldTestDocId + '-geopoint'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            location: {
              geoPointValue: {
                latitude: 37.7749,
                longitude: -122.4194,
              },
            },
          },
        }),
      })

      expect(response.status).toBe(200)
      const doc: FirestoreDocument = await response.json()
      expect(doc.fields?.location?.geoPointValue?.latitude).toBeCloseTo(37.7749)
      expect(doc.fields?.location?.geoPointValue?.longitude).toBeCloseTo(-122.4194)
    })

    it('should handle referenceValue correctly', async () => {
      const referencePath = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/other-collection/other-doc`

      const response = await fetch(apiUrl(testCollection, fieldTestDocId + '-reference'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            ref: { referenceValue: referencePath },
          },
        }),
      })

      expect(response.status).toBe(200)
      const doc: FirestoreDocument = await response.json()
      expect(doc.fields?.ref?.referenceValue).toBe(referencePath)
    })

    it('should handle arrayValue correctly', async () => {
      const response = await fetch(apiUrl(testCollection, fieldTestDocId + '-array'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            tags: {
              arrayValue: {
                values: [
                  { stringValue: 'firebase' },
                  { stringValue: 'firestore' },
                  { integerValue: '42' },
                  { booleanValue: true },
                ],
              },
            },
            emptyArray: {
              arrayValue: {},
            },
          },
        }),
      })

      expect(response.status).toBe(200)
      const doc: FirestoreDocument = await response.json()

      const arrayValues = doc.fields?.tags?.arrayValue?.values
      expect(arrayValues).toHaveLength(4)
      expect(arrayValues?.[0]?.stringValue).toBe('firebase')
      expect(arrayValues?.[1]?.stringValue).toBe('firestore')
      expect(arrayValues?.[2]?.integerValue).toBe('42')
      expect(arrayValues?.[3]?.booleanValue).toBe(true)

      // Empty array
      expect(doc.fields?.emptyArray?.arrayValue).toBeDefined()
      expect(doc.fields?.emptyArray?.arrayValue?.values).toBeUndefined()
    })

    it('should handle mapValue correctly', async () => {
      const response = await fetch(apiUrl(testCollection, fieldTestDocId + '-map'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            metadata: {
              mapValue: {
                fields: {
                  author: { stringValue: 'John Doe' },
                  version: { integerValue: '1' },
                  nested: {
                    mapValue: {
                      fields: {
                        deep: { stringValue: 'value' },
                      },
                    },
                  },
                },
              },
            },
            emptyMap: {
              mapValue: {},
            },
          },
        }),
      })

      expect(response.status).toBe(200)
      const doc: FirestoreDocument = await response.json()

      const mapFields = doc.fields?.metadata?.mapValue?.fields
      expect(mapFields?.author?.stringValue).toBe('John Doe')
      expect(mapFields?.version?.integerValue).toBe('1')
      expect(mapFields?.nested?.mapValue?.fields?.deep?.stringValue).toBe('value')

      // Empty map
      expect(doc.fields?.emptyMap?.mapValue).toBeDefined()
      expect(doc.fields?.emptyMap?.mapValue?.fields).toBeUndefined()
    })
  })

  describe('Subcollection Paths', () => {
    const parentCollection = 'users'
    const parentDocId = 'user-' + Date.now()
    const subcollection = 'posts'
    const subDocId = 'post-' + Date.now()

    it('should create document in subcollection', async () => {
      const response = await fetch(
        apiUrl(parentCollection, parentDocId, subcollection, subDocId),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              title: { stringValue: 'My First Post' },
              content: { stringValue: 'Hello from subcollection!' },
            },
          }),
        }
      )

      expect(response.status).toBe(200)

      const doc: FirestoreDocument = await response.json()
      expect(doc.name).toBe(
        documentPath(parentCollection, parentDocId, subcollection, subDocId)
      )
      expect(doc.fields?.title?.stringValue).toBe('My First Post')
    })

    it('should get document from subcollection', async () => {
      // First create it
      await fetch(apiUrl(parentCollection, parentDocId, subcollection, 'get-test'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { test: { booleanValue: true } },
        }),
      })

      // Then get it
      const response = await fetch(
        apiUrl(parentCollection, parentDocId, subcollection, 'get-test')
      )

      expect(response.status).toBe(200)

      const doc: FirestoreDocument = await response.json()
      expect(doc.name).toBe(
        documentPath(parentCollection, parentDocId, subcollection, 'get-test')
      )
    })

    it('should delete document from subcollection', async () => {
      const subDoc = 'delete-sub-test-' + Date.now()

      // Create
      await fetch(apiUrl(parentCollection, parentDocId, subcollection, subDoc), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { temp: { booleanValue: true } },
        }),
      })

      // Delete
      const deleteResponse = await fetch(
        apiUrl(parentCollection, parentDocId, subcollection, subDoc),
        { method: 'DELETE' }
      )

      expect(deleteResponse.status).toBe(200)

      // Verify gone
      const getResponse = await fetch(
        apiUrl(parentCollection, parentDocId, subcollection, subDoc)
      )
      expect(getResponse.status).toBe(404)
    })

    it('should handle deeply nested subcollections', async () => {
      const response = await fetch(
        `${BASE_URL}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/level1/doc1/level2/doc2/level3/doc3`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              depth: { integerValue: '3' },
            },
          }),
        }
      )

      expect(response.status).toBe(200)

      const doc: FirestoreDocument = await response.json()
      expect(doc.name).toBe(
        `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/level1/doc1/level2/doc2/level3/doc3`
      )
    })
  })

  describe('Preconditions for Conditional Writes', () => {
    const preconditionCollection = 'precondition-tests'

    it('should fail update with exists=false when document exists', async () => {
      const docId = 'exists-test-' + Date.now()

      // Create document first
      await fetch(apiUrl(preconditionCollection, docId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { created: { booleanValue: true } },
        }),
      })

      // Try to create with exists=false precondition (should fail)
      const response = await fetch(
        apiUrl(preconditionCollection, docId) + '?currentDocument.exists=false',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { created: { booleanValue: false } },
          }),
        }
      )

      expect(response.status).toBe(409) // ALREADY_EXISTS / FAILED_PRECONDITION
    })

    it('should succeed update with exists=false when document does not exist', async () => {
      const docId = 'not-exists-test-' + Date.now()

      const response = await fetch(
        apiUrl(preconditionCollection, docId) + '?currentDocument.exists=false',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { new: { booleanValue: true } },
          }),
        }
      )

      expect(response.status).toBe(200)
    })

    it('should fail update with exists=true when document does not exist', async () => {
      const docId = 'must-exist-test-' + Date.now()

      const response = await fetch(
        apiUrl(preconditionCollection, docId) + '?currentDocument.exists=true',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { updated: { booleanValue: true } },
          }),
        }
      )

      expect(response.status).toBe(404) // NOT_FOUND
    })

    it('should succeed update with exists=true when document exists', async () => {
      const docId = 'exists-update-test-' + Date.now()

      // Create first
      await fetch(apiUrl(preconditionCollection, docId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { version: { integerValue: '1' } },
        }),
      })

      // Update with exists=true
      const response = await fetch(
        apiUrl(preconditionCollection, docId) + '?currentDocument.exists=true',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { version: { integerValue: '2' } },
          }),
        }
      )

      expect(response.status).toBe(200)
    })

    it('should fail update with updateTime precondition when times do not match', async () => {
      const docId = 'update-time-test-' + Date.now()

      // Create document
      const createResponse = await fetch(apiUrl(preconditionCollection, docId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { version: { integerValue: '1' } },
        }),
      })

      // Use a different (old) timestamp
      const wrongTime = '2020-01-01T00:00:00.000000Z'

      const response = await fetch(
        apiUrl(preconditionCollection, docId) + `?currentDocument.updateTime=${encodeURIComponent(wrongTime)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { version: { integerValue: '2' } },
          }),
        }
      )

      expect(response.status).toBe(409) // FAILED_PRECONDITION
    })

    it('should succeed update with matching updateTime precondition', async () => {
      const docId = 'update-time-match-test-' + Date.now()

      // Create document
      const createResponse = await fetch(apiUrl(preconditionCollection, docId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { version: { integerValue: '1' } },
        }),
      })
      const createdDoc: FirestoreDocument = await createResponse.json()
      const updateTime = createdDoc.updateTime

      // Update with correct updateTime
      const response = await fetch(
        apiUrl(preconditionCollection, docId) + `?currentDocument.updateTime=${encodeURIComponent(updateTime!)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { version: { integerValue: '2' } },
          }),
        }
      )

      expect(response.status).toBe(200)
    })

    it('should fail delete with exists=true when document does not exist', async () => {
      const response = await fetch(
        apiUrl(preconditionCollection, 'non-existent-delete') + '?currentDocument.exists=true',
        { method: 'DELETE' }
      )

      expect(response.status).toBe(404)
    })

    it('should succeed delete with exists=true when document exists', async () => {
      const docId = 'delete-exists-test-' + Date.now()

      // Create first
      await fetch(apiUrl(preconditionCollection, docId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { temp: { booleanValue: true } },
        }),
      })

      // Delete with exists=true
      const response = await fetch(
        apiUrl(preconditionCollection, docId) + '?currentDocument.exists=true',
        { method: 'DELETE' }
      )

      expect(response.status).toBe(200)
    })
  })

  describe('Document Response Format', () => {
    it('should return proper document name format', async () => {
      const docId = 'format-test-' + Date.now()

      const response = await fetch(apiUrl(testCollection, docId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { test: { booleanValue: true } },
        }),
      })

      const doc: FirestoreDocument = await response.json()

      // Name should follow format: projects/{project}/databases/{db}/documents/{path}
      expect(doc.name).toMatch(
        /^projects\/[^/]+\/databases\/[^/]+\/documents\/.+$/
      )
      expect(doc.name).toContain(PROJECT_ID)
      expect(doc.name).toContain(DATABASE_ID)
      expect(doc.name).toContain(testCollection)
      expect(doc.name).toContain(docId)
    })

    it('should return timestamps in RFC 3339 format', async () => {
      const docId = 'timestamp-format-test-' + Date.now()

      const response = await fetch(apiUrl(testCollection, docId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { test: { booleanValue: true } },
        }),
      })

      const doc: FirestoreDocument = await response.json()

      // Timestamps should be RFC 3339 format with nanoseconds
      // Example: 2024-01-15T10:30:00.123456789Z
      const rfc3339Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

      expect(doc.createTime).toMatch(rfc3339Regex)
      expect(doc.updateTime).toMatch(rfc3339Regex)
    })

    it('should not include fields property for empty documents', async () => {
      const docId = 'empty-doc-test-' + Date.now()

      const response = await fetch(apiUrl(testCollection, docId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {},
        }),
      })

      const doc: FirestoreDocument = await response.json()

      // Document with no fields should either not have fields property
      // or have an empty fields object
      expect(doc.fields === undefined || Object.keys(doc.fields).length === 0).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should return proper error format for invalid project', async () => {
      const response = await fetch(
        `${BASE_URL}/v1/projects/invalid-project/databases/(default)/documents/test/doc`
      )

      expect(response.status).toBe(404)

      const error: FirestoreError = await response.json()
      expect(error.error).toBeDefined()
      expect(error.error.code).toBeDefined()
      expect(error.error.message).toBeDefined()
      expect(error.error.status).toBeDefined()
    })

    it('should return proper error format for invalid database', async () => {
      const response = await fetch(
        `${BASE_URL}/v1/projects/${PROJECT_ID}/databases/invalid-db/documents/test/doc`
      )

      expect(response.status).toBe(404)

      const error: FirestoreError = await response.json()
      expect(error.error).toBeDefined()
      expect(error.error.code).toBeDefined()
      expect(error.error.message).toBeDefined()
    })

    it('should return 400 for malformed request body', async () => {
      const response = await fetch(apiUrl(testCollection, 'malformed-test'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      })

      expect(response.status).toBe(400)
    })

    it('should return 400 for invalid field value type', async () => {
      const response = await fetch(apiUrl(testCollection, 'invalid-field-test'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            invalid: { unknownType: 'value' },
          },
        }),
      })

      expect(response.status).toBe(400)
    })
  })
})
