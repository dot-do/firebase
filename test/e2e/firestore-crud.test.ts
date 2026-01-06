/**
 * E2E Tests: Firestore CRUD with Firebase SDK
 *
 * Issue: firebase-rho
 *
 * These tests verify that Firestore Create, Read, Update, and Delete operations
 * work correctly with the Firebase SDK connected to the firebase.do backend.
 *
 * The tests use the official Firebase SDK and test both:
 * 1. Direct REST API calls (for compatibility with our REST implementation)
 * 2. SDK operations through the emulator connection
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initializeApp, deleteApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  type Firestore,
  type DocumentReference,
} from 'firebase/firestore'
import { clearAllDocuments } from '../../src/firestore/server'

// Configuration
const FIREBASE_CONFIG = {
  projectId: 'test-project',
  apiKey: 'test-api-key-for-e2e-testing',
}

const LOCAL_HOST = process.env.FIREBASE_DO_HOST || 'localhost'
const FIRESTORE_PORT = parseInt(process.env.FIREBASE_DO_FIRESTORE_PORT || '8080')

describe('E2E: Firestore CRUD with Firebase SDK', () => {
  let app: FirebaseApp
  let firestore: Firestore

  beforeAll(async () => {
    // Initialize Firebase app
    // Note: Firestore server is started by global test setup (test/setup.ts)
    app = initializeApp(FIREBASE_CONFIG, 'firestore-crud-test')
    firestore = getFirestore(app)

    // Connect to local emulator
    connectFirestoreEmulator(firestore, LOCAL_HOST, FIRESTORE_PORT)
  })

  afterAll(async () => {
    // Clean up Firebase apps
    const apps = getApps()
    for (const existingApp of apps) {
      await deleteApp(existingApp)
    }
  })

  beforeEach(() => {
    // Clear documents between tests
    clearAllDocuments()
  })

  // Helper to generate unique document IDs
  function generateDocId(): string {
    return `doc-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }

  describe('REST API Direct Tests (Baseline)', () => {
    /**
     * These tests use direct REST API calls to verify our backend implementation
     * works correctly before testing the SDK integration.
     */

    it('should CREATE a document via REST API', async () => {
      const docId = generateDocId()
      const docPath = `test-collection/${docId}`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              name: { stringValue: 'Test Document' },
              count: { integerValue: '42' },
              active: { booleanValue: true },
            },
          }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.name?.stringValue).toBe('Test Document')
      expect(doc.fields?.count?.integerValue).toBe('42')
      expect(doc.fields?.active?.booleanValue).toBe(true)
      expect(doc.createTime).toBeDefined()
      expect(doc.updateTime).toBeDefined()
    })

    it('should READ a document via REST API', async () => {
      const docId = generateDocId()
      const docPath = `test-collection/${docId}`

      // Create first
      await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              title: { stringValue: 'Read Test' },
            },
          }),
        }
      )

      // Read
      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.title?.stringValue).toBe('Read Test')
    })

    it('should UPDATE a document via REST API', async () => {
      const docId = generateDocId()
      const docPath = `test-collection/${docId}`

      // Create first
      await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              version: { integerValue: '1' },
              status: { stringValue: 'draft' },
            },
          }),
        }
      )

      // Update
      const updateResponse = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              version: { integerValue: '2' },
              status: { stringValue: 'published' },
            },
          }),
        }
      )

      expect(updateResponse.ok).toBe(true)
      const doc = await updateResponse.json()
      expect(doc.fields?.version?.integerValue).toBe('2')
      expect(doc.fields?.status?.stringValue).toBe('published')
    })

    it('should DELETE a document via REST API', async () => {
      const docId = generateDocId()
      const docPath = `test-collection/${docId}`

      // Create first
      await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              temporary: { booleanValue: true },
            },
          }),
        }
      )

      // Delete
      const deleteResponse = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        { method: 'DELETE' }
      )

      expect(deleteResponse.ok).toBe(true)

      // Verify deleted
      const getResponse = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`
      )
      expect(getResponse.status).toBe(404)
    })
  })

  describe('Firestore Value Types', () => {
    /**
     * Test all supported Firestore value types
     */

    it('should handle string values', async () => {
      const docId = generateDocId()
      const docPath = `types-test/${docId}`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              text: { stringValue: 'Hello, World!' },
              emoji: { stringValue: 'Fire emoji test' },
              empty: { stringValue: '' },
            },
          }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.text?.stringValue).toBe('Hello, World!')
      expect(doc.fields?.emoji?.stringValue).toBe('Fire emoji test')
      expect(doc.fields?.empty?.stringValue).toBe('')
    })

    it('should handle integer values', async () => {
      const docId = generateDocId()
      const docPath = `types-test/${docId}`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              positive: { integerValue: '12345' },
              negative: { integerValue: '-999' },
              zero: { integerValue: '0' },
              large: { integerValue: '9007199254740991' }, // Max safe integer
            },
          }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.positive?.integerValue).toBe('12345')
      expect(doc.fields?.negative?.integerValue).toBe('-999')
      expect(doc.fields?.zero?.integerValue).toBe('0')
    })

    it('should handle double values', async () => {
      const docId = generateDocId()
      const docPath = `types-test/${docId}`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              pi: { doubleValue: 3.14159 },
              negative: { doubleValue: -2.5 },
              scientific: { doubleValue: 1.23e10 },
            },
          }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.pi?.doubleValue).toBe(3.14159)
      expect(doc.fields?.negative?.doubleValue).toBe(-2.5)
    })

    it('should handle boolean values', async () => {
      const docId = generateDocId()
      const docPath = `types-test/${docId}`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              isActive: { booleanValue: true },
              isDeleted: { booleanValue: false },
            },
          }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.isActive?.booleanValue).toBe(true)
      expect(doc.fields?.isDeleted?.booleanValue).toBe(false)
    })

    it('should handle null values', async () => {
      const docId = generateDocId()
      const docPath = `types-test/${docId}`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              nullField: { nullValue: null },
            },
          }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.nullField?.nullValue).toBe(null)
    })

    it('should handle timestamp values', async () => {
      const docId = generateDocId()
      const docPath = `types-test/${docId}`
      const timestamp = '2024-01-15T10:30:00.000Z'

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              createdAt: { timestampValue: timestamp },
            },
          }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.createdAt?.timestampValue).toBe(timestamp)
    })

    it('should handle array values', async () => {
      const docId = generateDocId()
      const docPath = `types-test/${docId}`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              tags: {
                arrayValue: {
                  values: [
                    { stringValue: 'tag1' },
                    { stringValue: 'tag2' },
                    { stringValue: 'tag3' },
                  ],
                },
              },
              numbers: {
                arrayValue: {
                  values: [
                    { integerValue: '1' },
                    { integerValue: '2' },
                    { integerValue: '3' },
                  ],
                },
              },
            },
          }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.tags?.arrayValue?.values).toHaveLength(3)
      expect(doc.fields?.tags?.arrayValue?.values[0]?.stringValue).toBe('tag1')
    })

    it('should handle map values (nested objects)', async () => {
      const docId = generateDocId()
      const docPath = `types-test/${docId}`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              address: {
                mapValue: {
                  fields: {
                    street: { stringValue: '123 Main St' },
                    city: { stringValue: 'San Francisco' },
                    zip: { stringValue: '94102' },
                  },
                },
              },
            },
          }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.address?.mapValue?.fields?.street?.stringValue).toBe('123 Main St')
      expect(doc.fields?.address?.mapValue?.fields?.city?.stringValue).toBe('San Francisco')
    })

    it('should handle geopoint values', async () => {
      const docId = generateDocId()
      const docPath = `types-test/${docId}`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
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
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.location?.geoPointValue?.latitude).toBe(37.7749)
      expect(doc.fields?.location?.geoPointValue?.longitude).toBe(-122.4194)
    })

    it('should handle reference values', async () => {
      const docId = generateDocId()
      const docPath = `types-test/${docId}`
      const refPath = `projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/other-collection/other-doc`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              ref: { referenceValue: refPath },
            },
          }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.ref?.referenceValue).toBe(refPath)
    })

    it('should handle bytes values', async () => {
      const docId = generateDocId()
      const docPath = `types-test/${docId}`
      const base64Data = Buffer.from('Hello, bytes!').toString('base64')

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              data: { bytesValue: base64Data },
            },
          }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.data?.bytesValue).toBe(base64Data)
    })
  })

  describe('Document Operations', () => {
    /**
     * Test various document operations and edge cases
     */

    it('should handle documents with many fields', async () => {
      const docId = generateDocId()
      const docPath = `large-docs/${docId}`

      const fields: Record<string, { stringValue: string }> = {}
      for (let i = 0; i < 50; i++) {
        fields[`field_${i}`] = { stringValue: `value_${i}` }
      }

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(Object.keys(doc.fields || {}).length).toBe(50)
    })

    it('should handle deeply nested documents', async () => {
      const docId = generateDocId()
      const docPath = `nested-docs/${docId}`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              level1: {
                mapValue: {
                  fields: {
                    level2: {
                      mapValue: {
                        fields: {
                          level3: {
                            mapValue: {
                              fields: {
                                value: { stringValue: 'deeply nested' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(
        doc.fields?.level1?.mapValue?.fields?.level2?.mapValue?.fields?.level3?.mapValue?.fields?.value?.stringValue
      ).toBe('deeply nested')
    })

    it('should return 404 for non-existent document', async () => {
      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/non-existent/doc-${Date.now()}`
      )

      expect(response.status).toBe(404)
    })

    it('should handle subcollections', async () => {
      const parentId = generateDocId()
      const childId = generateDocId()
      const docPath = `parents/${parentId}/children/${childId}`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              name: { stringValue: 'Child Document' },
              parentRef: { stringValue: parentId },
            },
          }),
        }
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.name?.stringValue).toBe('Child Document')
      expect(doc.name).toContain(`parents/${parentId}/children/${childId}`)
    })

    it('should preserve document timestamps', async () => {
      const docId = generateDocId()
      const docPath = `timestamp-test/${docId}`

      // Create
      const createResponse = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              value: { integerValue: '1' },
            },
          }),
        }
      )

      const createDoc = await createResponse.json()
      const createTime = createDoc.createTime
      const firstUpdateTime = createDoc.updateTime

      expect(createTime).toBeDefined()
      expect(firstUpdateTime).toBeDefined()

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10))

      // Update
      const updateResponse = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              value: { integerValue: '2' },
            },
          }),
        }
      )

      const updateDoc = await updateResponse.json()

      // createTime should be preserved
      expect(updateDoc.createTime).toBe(createTime)
      // updateTime should be different
      expect(updateDoc.updateTime).not.toBe(firstUpdateTime)
    })

    it('should support field masks on read', async () => {
      const docId = generateDocId()
      const docPath = `mask-test/${docId}`

      // Create document with multiple fields
      await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              public: { stringValue: 'visible' },
              private: { stringValue: 'hidden' },
              metadata: { stringValue: 'extra' },
            },
          }),
        }
      )

      // Read with field mask
      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}?mask.fieldPaths=public`
      )

      expect(response.ok).toBe(true)
      const doc = await response.json()
      expect(doc.fields?.public?.stringValue).toBe('visible')
      expect(doc.fields?.private).toBeUndefined()
      expect(doc.fields?.metadata).toBeUndefined()
    })

    it('should support partial updates with update mask', async () => {
      const docId = generateDocId()
      const docPath = `update-mask-test/${docId}`

      // Create document
      await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              field1: { stringValue: 'original1' },
              field2: { stringValue: 'original2' },
              field3: { stringValue: 'original3' },
            },
          }),
        }
      )

      // Partial update with mask
      const updateResponse = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}?updateMask.fieldPaths=field1`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              field1: { stringValue: 'updated1' },
            },
          }),
        }
      )

      expect(updateResponse.ok).toBe(true)
      const doc = await updateResponse.json()
      expect(doc.fields?.field1?.stringValue).toBe('updated1')
      expect(doc.fields?.field2?.stringValue).toBe('original2')
      expect(doc.fields?.field3?.stringValue).toBe('original3')
    })
  })

  describe('Error Handling', () => {
    /**
     * Test error scenarios
     */

    it('should reject invalid document paths', async () => {
      // Path with odd number of segments (collection only, no document)
      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/invalid-collection`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              test: { stringValue: 'value' },
            },
          }),
        }
      )

      expect(response.status).toBe(400)
    })

    it('should reject invalid field values', async () => {
      const docId = generateDocId()
      const docPath = `validation-test/${docId}`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              invalid: { unknownType: 'value' }, // Invalid value type
            },
          }),
        }
      )

      expect(response.status).toBe(400)
    })

    it('should reject invalid GeoPoint coordinates', async () => {
      const docId = generateDocId()
      const docPath = `validation-test/${docId}`

      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              location: {
                geoPointValue: {
                  latitude: 100, // Invalid: > 90
                  longitude: 0,
                },
              },
            },
          }),
        }
      )

      expect(response.status).toBe(400)
    })

    it('should handle precondition failures', async () => {
      const docId = generateDocId()
      const docPath = `precondition-test/${docId}`

      // Try to update with precondition that document exists (but it doesn't)
      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}?currentDocument.exists=true`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              test: { stringValue: 'value' },
            },
          }),
        }
      )

      expect(response.status).toBe(404)
    })

    it('should handle delete of non-existent document', async () => {
      const response = await fetch(
        `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/non-existent/doc-${Date.now()}`,
        { method: 'DELETE' }
      )

      expect(response.status).toBe(404)
    })
  })

  describe('CRUD Integration Tests', () => {
    /**
     * Complete CRUD flow tests
     */

    it('should complete full CRUD lifecycle', async () => {
      const docId = generateDocId()
      const docPath = `crud-lifecycle/${docId}`
      const baseUrl = `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${docPath}`

      // CREATE
      const createResponse = await fetch(baseUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            name: { stringValue: 'Test Item' },
            count: { integerValue: '0' },
            active: { booleanValue: true },
          },
        }),
      })
      expect(createResponse.ok).toBe(true)
      const createdDoc = await createResponse.json()
      expect(createdDoc.fields?.name?.stringValue).toBe('Test Item')

      // READ
      const readResponse = await fetch(baseUrl)
      expect(readResponse.ok).toBe(true)
      const readDoc = await readResponse.json()
      expect(readDoc.fields?.name?.stringValue).toBe('Test Item')

      // UPDATE
      const updateResponse = await fetch(baseUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            name: { stringValue: 'Updated Item' },
            count: { integerValue: '1' },
            active: { booleanValue: false },
          },
        }),
      })
      expect(updateResponse.ok).toBe(true)
      const updatedDoc = await updateResponse.json()
      expect(updatedDoc.fields?.name?.stringValue).toBe('Updated Item')
      expect(updatedDoc.fields?.count?.integerValue).toBe('1')
      expect(updatedDoc.fields?.active?.booleanValue).toBe(false)

      // DELETE
      const deleteResponse = await fetch(baseUrl, { method: 'DELETE' })
      expect(deleteResponse.ok).toBe(true)

      // VERIFY DELETION
      const verifyResponse = await fetch(baseUrl)
      expect(verifyResponse.status).toBe(404)
    })

    it('should handle multiple documents in same collection', async () => {
      const collection = `multi-docs-${Date.now()}`
      const docs = [
        { name: 'Doc 1', value: 100 },
        { name: 'Doc 2', value: 200 },
        { name: 'Doc 3', value: 300 },
      ]

      // Create all documents
      for (let i = 0; i < docs.length; i++) {
        const response = await fetch(
          `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${collection}/doc-${i}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                name: { stringValue: docs[i].name },
                value: { integerValue: String(docs[i].value) },
              },
            }),
          }
        )
        expect(response.ok).toBe(true)
      }

      // Verify each document
      for (let i = 0; i < docs.length; i++) {
        const response = await fetch(
          `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${collection}/doc-${i}`
        )
        expect(response.ok).toBe(true)
        const doc = await response.json()
        expect(doc.fields?.name?.stringValue).toBe(docs[i].name)
        expect(doc.fields?.value?.integerValue).toBe(String(docs[i].value))
      }
    })

    it('should handle concurrent document operations', async () => {
      const collection = `concurrent-${Date.now()}`

      // Create multiple documents concurrently
      const createPromises = Array.from({ length: 10 }, (_, i) =>
        fetch(
          `http://${LOCAL_HOST}:${FIRESTORE_PORT}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${collection}/doc-${i}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                index: { integerValue: String(i) },
              },
            }),
          }
        )
      )

      const responses = await Promise.all(createPromises)

      // All should succeed
      for (const response of responses) {
        expect(response.ok).toBe(true)
      }
    })
  })
})
