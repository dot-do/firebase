import { describe, it, expect, beforeEach } from 'vitest'
import {
  getDocument,
  updateDocument,
  deleteDocument,
  clearAllDocuments,
  buildDocumentPath,
  parseDocumentPath,
  isValidDocumentPath,
  type Document,
  type Precondition,
} from '../../src/firestore/crud'

/**
 * Unit tests for Firestore CRUD module
 * These tests verify the core business logic without requiring an HTTP server
 */

describe('Firestore CRUD Module - Unit Tests', () => {
  const PROJECT_ID = 'test-project'
  const DATABASE_ID = '(default)'
  const COLLECTION = 'users'
  const DOC_ID = 'user123'

  let docPath: string

  beforeEach(() => {
    clearAllDocuments()
    docPath = buildDocumentPath(PROJECT_ID, DATABASE_ID, `${COLLECTION}/${DOC_ID}`)
  })

  describe('Document Path Utilities', () => {
    it('should build document path correctly', () => {
      const path = buildDocumentPath(PROJECT_ID, DATABASE_ID, 'users/user123')
      expect(path).toBe('projects/test-project/databases/(default)/documents/users/user123')
    })

    it('should parse document path correctly', () => {
      const path = 'projects/test-project/databases/(default)/documents/users/user123'
      const parsed = parseDocumentPath(path)

      expect(parsed).not.toBeNull()
      expect(parsed?.projectId).toBe('test-project')
      expect(parsed?.databaseId).toBe('(default)')
      expect(parsed?.documentPath).toBe('users/user123')
    })

    it('should validate document paths', () => {
      expect(isValidDocumentPath('projects/p/databases/d/documents/col/doc')).toBe(true)
      expect(
        isValidDocumentPath('projects/p/databases/d/documents/col/doc/subcol/subdoc')
      ).toBe(true)
      expect(isValidDocumentPath('projects/p/databases/d/documents/col')).toBe(false)
      expect(isValidDocumentPath('invalid')).toBe(false)
    })
  })

  describe('getDocument', () => {
    it('should return null for non-existent document', () => {
      const doc = getDocument(docPath)
      expect(doc).toBeNull()
    })

    it('should return document after creation', () => {
      updateDocument(docPath, {
        name: { stringValue: 'John Doe' },
        age: { integerValue: '30' },
      })

      const doc = getDocument(docPath)
      expect(doc).not.toBeNull()
      expect(doc?.name).toBe(docPath)
      expect(doc?.fields?.name?.stringValue).toBe('John Doe')
      expect(doc?.fields?.age?.integerValue).toBe('30')
      expect(doc?.createTime).toBeDefined()
      expect(doc?.updateTime).toBeDefined()
    })

    it('should support field masks', () => {
      updateDocument(docPath, {
        field1: { stringValue: 'value1' },
        field2: { stringValue: 'value2' },
        field3: { stringValue: 'value3' },
      })

      const doc = getDocument(docPath, { mask: ['field1', 'field3'] })
      expect(doc?.fields?.field1?.stringValue).toBe('value1')
      expect(doc?.fields?.field3?.stringValue).toBe('value3')
      expect(doc?.fields?.field2).toBeUndefined()
    })

    it('should handle nested field masks', () => {
      updateDocument(docPath, {
        user: {
          mapValue: {
            fields: {
              name: { stringValue: 'John' },
              email: { stringValue: 'john@example.com' },
            },
          },
        },
        metadata: {
          mapValue: {
            fields: {
              created: { stringValue: '2024-01-01' },
            },
          },
        },
      })

      const doc = getDocument(docPath, { mask: ['user.name'] })
      expect(doc?.fields?.user?.mapValue?.fields?.name?.stringValue).toBe('John')
      expect(doc?.fields?.user?.mapValue?.fields?.email).toBeUndefined()
      expect(doc?.fields?.metadata).toBeUndefined()
    })
  })

  describe('updateDocument', () => {
    it('should create a new document', () => {
      const doc = updateDocument(docPath, {
        title: { stringValue: 'Test Document' },
        count: { integerValue: '42' },
      })

      expect(doc.name).toBe(docPath)
      expect(doc.fields?.title?.stringValue).toBe('Test Document')
      expect(doc.fields?.count?.integerValue).toBe('42')
      expect(doc.createTime).toBeDefined()
      expect(doc.updateTime).toBeDefined()
      expect(doc.createTime).toBe(doc.updateTime)
    })

    it('should update an existing document', () => {
      const doc1 = updateDocument(docPath, {
        version: { integerValue: '1' },
      })

      const doc2 = updateDocument(docPath, {
        version: { integerValue: '2' },
        newField: { stringValue: 'added' },
      })

      expect(doc2.fields?.version?.integerValue).toBe('2')
      expect(doc2.fields?.newField?.stringValue).toBe('added')
      expect(doc2.createTime).toBe(doc1.createTime)
      expect(doc2.updateTime).not.toBe(doc1.updateTime)
    })

    it('should support update masks', () => {
      updateDocument(docPath, {
        field1: { stringValue: 'original1' },
        field2: { stringValue: 'original2' },
        field3: { stringValue: 'original3' },
      })

      const doc = updateDocument(
        docPath,
        {
          field2: { stringValue: 'updated2' },
        },
        { updateMask: ['field2'] }
      )

      expect(doc.fields?.field1?.stringValue).toBe('original1')
      expect(doc.fields?.field2?.stringValue).toBe('updated2')
      expect(doc.fields?.field3?.stringValue).toBe('original3')
    })

    it('should handle nested field updates with update mask', () => {
      updateDocument(docPath, {
        user: {
          mapValue: {
            fields: {
              name: { stringValue: 'John' },
              email: { stringValue: 'john@example.com' },
            },
          },
        },
      })

      const doc = updateDocument(
        docPath,
        {
          user: {
            mapValue: {
              fields: {
                email: { stringValue: 'newemail@example.com' },
              },
            },
          },
        },
        { updateMask: ['user.email'] }
      )

      expect(doc.fields?.user?.mapValue?.fields?.name?.stringValue).toBe('John')
      expect(doc.fields?.user?.mapValue?.fields?.email?.stringValue).toBe(
        'newemail@example.com'
      )
    })

    it('should handle empty fields', () => {
      const doc = updateDocument(docPath, {})
      expect(doc.fields).toBeUndefined()
    })
  })

  describe('deleteDocument', () => {
    it('should delete an existing document', () => {
      updateDocument(docPath, { temp: { booleanValue: true } })

      const deleted = deleteDocument(docPath)
      expect(deleted).toBe(true)

      const doc = getDocument(docPath)
      expect(doc).toBeNull()
    })

    it('should return false when deleting non-existent document', () => {
      const deleted = deleteDocument(docPath)
      expect(deleted).toBe(false)
    })
  })

  describe('Preconditions', () => {
    it('should fail update with exists=false when document exists', () => {
      updateDocument(docPath, { created: { booleanValue: true } })

      expect(() =>
        updateDocument(
          docPath,
          { created: { booleanValue: false } },
          { currentDocument: { exists: false } }
        )
      ).toThrow()
    })

    it('should succeed update with exists=false when document does not exist', () => {
      const doc = updateDocument(
        docPath,
        { new: { booleanValue: true } },
        { currentDocument: { exists: false } }
      )

      expect(doc.fields?.new?.booleanValue).toBe(true)
    })

    it('should fail update with exists=true when document does not exist', () => {
      expect(() =>
        updateDocument(
          docPath,
          { updated: { booleanValue: true } },
          { currentDocument: { exists: true } }
        )
      ).toThrow()
    })

    it('should succeed update with exists=true when document exists', () => {
      updateDocument(docPath, { version: { integerValue: '1' } })

      const doc = updateDocument(
        docPath,
        { version: { integerValue: '2' } },
        { currentDocument: { exists: true } }
      )

      expect(doc.fields?.version?.integerValue).toBe('2')
    })

    it('should fail update with wrong updateTime', () => {
      updateDocument(docPath, { version: { integerValue: '1' } })

      const wrongTime = '2020-01-01T00:00:00.000000Z'

      expect(() =>
        updateDocument(
          docPath,
          { version: { integerValue: '2' } },
          { currentDocument: { updateTime: wrongTime } }
        )
      ).toThrow()
    })

    it('should succeed update with correct updateTime', () => {
      const doc1 = updateDocument(docPath, { version: { integerValue: '1' } })

      const doc2 = updateDocument(
        docPath,
        { version: { integerValue: '2' } },
        { currentDocument: { updateTime: doc1.updateTime } }
      )

      expect(doc2.fields?.version?.integerValue).toBe('2')
    })

    it('should fail delete with exists=true when document does not exist', () => {
      expect(() =>
        deleteDocument(docPath, { currentDocument: { exists: true } })
      ).toThrow()
    })

    it('should succeed delete with exists=true when document exists', () => {
      updateDocument(docPath, { temp: { booleanValue: true } })

      const deleted = deleteDocument(docPath, { currentDocument: { exists: true } })
      expect(deleted).toBe(true)
    })
  })

  describe('Subcollections', () => {
    it('should handle subcollection documents', () => {
      const subPath = buildDocumentPath(
        PROJECT_ID,
        DATABASE_ID,
        'users/user123/posts/post456'
      )

      const doc = updateDocument(subPath, {
        title: { stringValue: 'My Post' },
      })

      expect(doc.name).toBe(subPath)
      expect(doc.fields?.title?.stringValue).toBe('My Post')
    })

    it('should handle deeply nested subcollections', () => {
      const deepPath = buildDocumentPath(
        PROJECT_ID,
        DATABASE_ID,
        'level1/doc1/level2/doc2/level3/doc3'
      )

      const doc = updateDocument(deepPath, {
        depth: { integerValue: '3' },
      })

      expect(doc.name).toBe(deepPath)
      expect(doc.fields?.depth?.integerValue).toBe('3')
    })
  })

  describe('Value Types', () => {
    it('should handle all supported value types', () => {
      const doc = updateDocument(docPath, {
        stringVal: { stringValue: 'hello' },
        intVal: { integerValue: '42' },
        doubleVal: { doubleValue: 3.14 },
        boolVal: { booleanValue: true },
        nullVal: { nullValue: null },
        timestampVal: { timestampValue: '2024-01-15T10:30:00.000Z' },
        bytesVal: { bytesValue: 'SGVsbG8=' },
        refVal: {
          referenceValue: 'projects/test/databases/(default)/documents/col/doc',
        },
        geoVal: { geoPointValue: { latitude: 37.7749, longitude: -122.4194 } },
        arrayVal: {
          arrayValue: {
            values: [{ stringValue: 'item1' }, { stringValue: 'item2' }],
          },
        },
        mapVal: {
          mapValue: {
            fields: {
              key1: { stringValue: 'value1' },
              key2: { integerValue: '123' },
            },
          },
        },
      })

      expect(doc.fields?.stringVal?.stringValue).toBe('hello')
      expect(doc.fields?.intVal?.integerValue).toBe('42')
      expect(doc.fields?.doubleVal?.doubleValue).toBe(3.14)
      expect(doc.fields?.boolVal?.booleanValue).toBe(true)
      expect(doc.fields?.nullVal?.nullValue).toBe(null)
      expect(doc.fields?.arrayVal?.arrayValue?.values).toHaveLength(2)
      expect(doc.fields?.mapVal?.mapValue?.fields?.key1?.stringValue).toBe('value1')
    })
  })

  describe('Timestamps', () => {
    it('should generate RFC3339 timestamps', () => {
      const doc = updateDocument(docPath, { test: { booleanValue: true } })

      const rfc3339Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/

      expect(doc.createTime).toMatch(rfc3339Regex)
      expect(doc.updateTime).toMatch(rfc3339Regex)
    })

    it('should update updateTime on subsequent updates', async () => {
      const doc1 = updateDocument(docPath, { version: { integerValue: '1' } })

      // Wait to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10))

      const doc2 = updateDocument(docPath, { version: { integerValue: '2' } })

      expect(doc2.createTime).toBe(doc1.createTime)
      expect(doc2.updateTime).not.toBe(doc1.updateTime)
    })
  })
})
