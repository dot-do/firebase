/**
 * Memory Limits Tests for Document Store
 *
 * These tests verify that the document store enforces configurable memory limits
 * and properly evicts documents using LRU (Least Recently Used) eviction policy.
 *
 * Test scenarios:
 * 1. Configure max document count
 * 2. Attempt to exceed limit
 * 3. Verify oldest/LRU documents are evicted or error is returned
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  updateDocument,
  getDocument,
  deleteDocument,
  clearAllDocuments,
  getAllDocuments,
  buildDocumentPath,
  setMaxDocumentCount,
  getMaxDocumentCount,
  getDocumentCount,
  setEvictionPolicy,
  getEvictionPolicy,
  type EvictionPolicy,
} from '../../src/firestore/crud'
import type { Value } from '../../src/firestore/values'

// Helper to create a document path
function docPath(collection: string, docId: string): string {
  return buildDocumentPath('test-project', '(default)', `${collection}/${docId}`)
}

// Helper to create simple test document fields
function testFields(value: string): Record<string, Value> {
  return {
    name: { stringValue: value },
  }
}

describe('Document Store Memory Limits', () => {
  beforeEach(() => {
    clearAllDocuments()
  })

  afterEach(() => {
    clearAllDocuments()
    // Reset to default (unlimited)
    setMaxDocumentCount(0)
    setEvictionPolicy('lru')
  })

  describe('Configuration', () => {
    it('should allow setting max document count', () => {
      setMaxDocumentCount(100)
      expect(getMaxDocumentCount()).toBe(100)
    })

    it('should default to unlimited (0) max document count', () => {
      expect(getMaxDocumentCount()).toBe(0)
    })

    it('should allow setting max to unlimited by passing 0', () => {
      setMaxDocumentCount(100)
      setMaxDocumentCount(0)
      expect(getMaxDocumentCount()).toBe(0)
    })

    it('should reject negative max document count', () => {
      expect(() => setMaxDocumentCount(-1)).toThrow()
    })

    it('should track current document count', () => {
      expect(getDocumentCount()).toBe(0)

      updateDocument(docPath('users', 'user1'), testFields('User 1'))
      expect(getDocumentCount()).toBe(1)

      updateDocument(docPath('users', 'user2'), testFields('User 2'))
      expect(getDocumentCount()).toBe(2)

      deleteDocument(docPath('users', 'user1'))
      expect(getDocumentCount()).toBe(1)
    })

    it('should allow configuring eviction policy', () => {
      setEvictionPolicy('lru')
      expect(getEvictionPolicy()).toBe('lru')

      setEvictionPolicy('error')
      expect(getEvictionPolicy()).toBe('error')
    })

    it('should default to LRU eviction policy', () => {
      expect(getEvictionPolicy()).toBe('lru')
    })
  })

  describe('Max Document Count Enforcement', () => {
    it('should allow documents up to the limit', () => {
      setMaxDocumentCount(3)

      updateDocument(docPath('users', 'user1'), testFields('User 1'))
      updateDocument(docPath('users', 'user2'), testFields('User 2'))
      updateDocument(docPath('users', 'user3'), testFields('User 3'))

      expect(getDocumentCount()).toBe(3)
      expect(getDocument(docPath('users', 'user1'))).not.toBeNull()
      expect(getDocument(docPath('users', 'user2'))).not.toBeNull()
      expect(getDocument(docPath('users', 'user3'))).not.toBeNull()
    })

    it('should evict oldest document when limit exceeded with LRU policy', () => {
      setMaxDocumentCount(3)
      setEvictionPolicy('lru')

      // Create 3 documents
      updateDocument(docPath('users', 'user1'), testFields('User 1'))
      updateDocument(docPath('users', 'user2'), testFields('User 2'))
      updateDocument(docPath('users', 'user3'), testFields('User 3'))

      // Add a 4th document - should evict user1 (oldest)
      updateDocument(docPath('users', 'user4'), testFields('User 4'))

      expect(getDocumentCount()).toBe(3)
      expect(getDocument(docPath('users', 'user1'))).toBeNull() // Evicted
      expect(getDocument(docPath('users', 'user2'))).not.toBeNull()
      expect(getDocument(docPath('users', 'user3'))).not.toBeNull()
      expect(getDocument(docPath('users', 'user4'))).not.toBeNull()
    })

    it('should throw error when limit exceeded with error policy', () => {
      setMaxDocumentCount(2)
      setEvictionPolicy('error')

      updateDocument(docPath('users', 'user1'), testFields('User 1'))
      updateDocument(docPath('users', 'user2'), testFields('User 2'))

      expect(() => {
        updateDocument(docPath('users', 'user3'), testFields('User 3'))
      }).toThrow()

      // Verify the document was not added
      expect(getDocumentCount()).toBe(2)
      expect(getDocument(docPath('users', 'user3'))).toBeNull()
    })

    it('should not count update of existing document against limit', () => {
      setMaxDocumentCount(2)

      updateDocument(docPath('users', 'user1'), testFields('User 1'))
      updateDocument(docPath('users', 'user2'), testFields('User 2'))

      // Updating existing document should not trigger eviction
      updateDocument(docPath('users', 'user1'), testFields('User 1 Updated'))

      expect(getDocumentCount()).toBe(2)
      expect(getDocument(docPath('users', 'user1'))?.fields?.name?.stringValue).toBe(
        'User 1 Updated'
      )
    })
  })

  describe('LRU Eviction Policy', () => {
    it('should evict least recently created document first', () => {
      setMaxDocumentCount(3)
      setEvictionPolicy('lru')

      // Create documents in order
      updateDocument(docPath('data', 'oldest'), testFields('Oldest'))
      updateDocument(docPath('data', 'middle'), testFields('Middle'))
      updateDocument(docPath('data', 'newest'), testFields('Newest'))

      // Add another document - should evict 'oldest'
      updateDocument(docPath('data', 'extra'), testFields('Extra'))

      expect(getDocument(docPath('data', 'oldest'))).toBeNull()
      expect(getDocument(docPath('data', 'middle'))).not.toBeNull()
      expect(getDocument(docPath('data', 'newest'))).not.toBeNull()
      expect(getDocument(docPath('data', 'extra'))).not.toBeNull()
    })

    it('should update LRU order when document is read', () => {
      setMaxDocumentCount(3)
      setEvictionPolicy('lru')

      // Create 3 documents
      updateDocument(docPath('data', 'first'), testFields('First'))
      updateDocument(docPath('data', 'second'), testFields('Second'))
      updateDocument(docPath('data', 'third'), testFields('Third'))

      // Read 'first' to make it most recently used
      getDocument(docPath('data', 'first'))

      // Add a 4th document - should evict 'second' (now least recently used)
      updateDocument(docPath('data', 'fourth'), testFields('Fourth'))

      expect(getDocument(docPath('data', 'first'))).not.toBeNull() // Was accessed, not evicted
      expect(getDocument(docPath('data', 'second'))).toBeNull() // Evicted as LRU
      expect(getDocument(docPath('data', 'third'))).not.toBeNull()
      expect(getDocument(docPath('data', 'fourth'))).not.toBeNull()
    })

    it('should update LRU order when document is updated', () => {
      setMaxDocumentCount(3)
      setEvictionPolicy('lru')

      // Create 3 documents
      updateDocument(docPath('data', 'first'), testFields('First'))
      updateDocument(docPath('data', 'second'), testFields('Second'))
      updateDocument(docPath('data', 'third'), testFields('Third'))

      // Update 'first' to make it most recently used
      updateDocument(docPath('data', 'first'), testFields('First Updated'))

      // Add a 4th document - should evict 'second' (now least recently used)
      updateDocument(docPath('data', 'fourth'), testFields('Fourth'))

      expect(getDocument(docPath('data', 'first'))).not.toBeNull() // Was updated, not evicted
      expect(getDocument(docPath('data', 'second'))).toBeNull() // Evicted as LRU
      expect(getDocument(docPath('data', 'third'))).not.toBeNull()
      expect(getDocument(docPath('data', 'fourth'))).not.toBeNull()
    })

    it('should evict multiple documents if needed when limit is significantly exceeded', () => {
      // Start with unlimited
      updateDocument(docPath('data', 'doc1'), testFields('Doc 1'))
      updateDocument(docPath('data', 'doc2'), testFields('Doc 2'))
      updateDocument(docPath('data', 'doc3'), testFields('Doc 3'))
      updateDocument(docPath('data', 'doc4'), testFields('Doc 4'))
      updateDocument(docPath('data', 'doc5'), testFields('Doc 5'))

      expect(getDocumentCount()).toBe(5)

      // Now set a smaller limit - should trigger eviction
      setMaxDocumentCount(2)

      // The oldest 3 documents should be evicted
      expect(getDocumentCount()).toBe(2)
      expect(getDocument(docPath('data', 'doc1'))).toBeNull()
      expect(getDocument(docPath('data', 'doc2'))).toBeNull()
      expect(getDocument(docPath('data', 'doc3'))).toBeNull()
      expect(getDocument(docPath('data', 'doc4'))).not.toBeNull()
      expect(getDocument(docPath('data', 'doc5'))).not.toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('should handle limit of 1 correctly', () => {
      setMaxDocumentCount(1)
      setEvictionPolicy('lru')

      updateDocument(docPath('data', 'first'), testFields('First'))
      expect(getDocumentCount()).toBe(1)

      updateDocument(docPath('data', 'second'), testFields('Second'))
      expect(getDocumentCount()).toBe(1)
      expect(getDocument(docPath('data', 'first'))).toBeNull()
      expect(getDocument(docPath('data', 'second'))).not.toBeNull()
    })

    it('should work correctly when documents are deleted manually', () => {
      setMaxDocumentCount(3)

      updateDocument(docPath('data', 'doc1'), testFields('Doc 1'))
      updateDocument(docPath('data', 'doc2'), testFields('Doc 2'))
      updateDocument(docPath('data', 'doc3'), testFields('Doc 3'))

      // Manually delete a document
      deleteDocument(docPath('data', 'doc2'))
      expect(getDocumentCount()).toBe(2)

      // Should now be able to add another without eviction
      updateDocument(docPath('data', 'doc4'), testFields('Doc 4'))
      expect(getDocumentCount()).toBe(3)
      expect(getDocument(docPath('data', 'doc1'))).not.toBeNull()
      expect(getDocument(docPath('data', 'doc3'))).not.toBeNull()
      expect(getDocument(docPath('data', 'doc4'))).not.toBeNull()
    })

    it('should handle clearAllDocuments correctly', () => {
      setMaxDocumentCount(3)

      updateDocument(docPath('data', 'doc1'), testFields('Doc 1'))
      updateDocument(docPath('data', 'doc2'), testFields('Doc 2'))
      updateDocument(docPath('data', 'doc3'), testFields('Doc 3'))

      clearAllDocuments()

      expect(getDocumentCount()).toBe(0)

      // Should be able to add documents again
      updateDocument(docPath('data', 'newDoc'), testFields('New Doc'))
      expect(getDocumentCount()).toBe(1)
    })

    it('should work with documents across different collections', () => {
      setMaxDocumentCount(3)
      setEvictionPolicy('lru')

      updateDocument(docPath('users', 'user1'), testFields('User 1'))
      updateDocument(docPath('posts', 'post1'), testFields('Post 1'))
      updateDocument(docPath('comments', 'comment1'), testFields('Comment 1'))

      // Add another document - should evict user1 (oldest)
      updateDocument(docPath('users', 'user2'), testFields('User 2'))

      expect(getDocumentCount()).toBe(3)
      expect(getDocument(docPath('users', 'user1'))).toBeNull() // Evicted
      expect(getDocument(docPath('posts', 'post1'))).not.toBeNull()
      expect(getDocument(docPath('comments', 'comment1'))).not.toBeNull()
      expect(getDocument(docPath('users', 'user2'))).not.toBeNull()
    })

    it('should not evict when adding document to unlimited store', () => {
      // Default is unlimited (0)
      expect(getMaxDocumentCount()).toBe(0)

      // Add many documents
      for (let i = 0; i < 100; i++) {
        updateDocument(docPath('data', `doc${i}`), testFields(`Doc ${i}`))
      }

      expect(getDocumentCount()).toBe(100)

      // All documents should still exist
      for (let i = 0; i < 100; i++) {
        expect(getDocument(docPath('data', `doc${i}`))).not.toBeNull()
      }
    })
  })

  describe('Error Eviction Policy', () => {
    it('should throw specific error type when limit exceeded', () => {
      setMaxDocumentCount(2)
      setEvictionPolicy('error')

      updateDocument(docPath('data', 'doc1'), testFields('Doc 1'))
      updateDocument(docPath('data', 'doc2'), testFields('Doc 2'))

      try {
        updateDocument(docPath('data', 'doc3'), testFields('Doc 3'))
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).toContain('limit')
        expect(error.firestoreError?.error?.status).toBe('RESOURCE_EXHAUSTED')
        expect(error.firestoreError?.error?.code).toBe(429)
      }
    })

    it('should not throw when updating existing document at limit', () => {
      setMaxDocumentCount(2)
      setEvictionPolicy('error')

      updateDocument(docPath('data', 'doc1'), testFields('Doc 1'))
      updateDocument(docPath('data', 'doc2'), testFields('Doc 2'))

      // This should not throw because we're updating, not adding
      expect(() => {
        updateDocument(docPath('data', 'doc1'), testFields('Doc 1 Updated'))
      }).not.toThrow()
    })
  })
})
