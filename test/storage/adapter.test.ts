/**
 * Storage Adapter Tests
 *
 * Tests for the StorageAdapter interface and InMemoryAdapter implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryAdapter } from '../../src/storage/in-memory-adapter'
import type { StoredObjectMetadata } from '../../src/storage/adapter'

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_BUCKET = 'test-bucket'

/** Helper to create test metadata */
function createTestMetadata(
  path: string,
  bucket: string = TEST_BUCKET,
  overrides: Partial<StoredObjectMetadata> = {}
): StoredObjectMetadata {
  const now = new Date().toISOString()
  return {
    name: path,
    bucket,
    generation: String(Date.now()),
    metageneration: '1',
    contentType: 'application/octet-stream',
    size: '0',
    md5Hash: 'XUFAKrxLKna5cZ2REBfFkg==',
    crc32c: 'aWS7Yw==',
    etag: `"${Date.now()}"`,
    timeCreated: now,
    updated: now,
    storageClass: 'STANDARD',
    ...overrides,
  }
}

/** Helper to create test data */
function createTestData(content: string = 'test data'): Buffer {
  return Buffer.from(content, 'utf-8')
}

// ============================================================================
// InMemoryAdapter Tests
// ============================================================================

describe('InMemoryAdapter', () => {
  let adapter: InMemoryAdapter

  beforeEach(async () => {
    adapter = new InMemoryAdapter()
    await adapter.createBucket(TEST_BUCKET)
  })

  // ==========================================================================
  // Bucket Operations
  // ==========================================================================

  describe('Bucket Operations', () => {
    it('should create a bucket', async () => {
      const newBucket = 'new-bucket'
      await adapter.createBucket(newBucket)

      const exists = await adapter.bucketExists(newBucket)
      expect(exists).toBe(true)
    })

    it('should check bucket existence', async () => {
      expect(await adapter.bucketExists(TEST_BUCKET)).toBe(true)
      expect(await adapter.bucketExists('non-existent')).toBe(false)
    })

    it('should delete an empty bucket', async () => {
      const emptyBucket = 'empty-bucket'
      await adapter.createBucket(emptyBucket)

      const deleted = await adapter.deleteBucket(emptyBucket)
      expect(deleted).toBe(true)
      expect(await adapter.bucketExists(emptyBucket)).toBe(false)
    })

    it('should not delete a non-empty bucket', async () => {
      const data = createTestData()
      const metadata = createTestMetadata('file.txt')
      metadata.size = String(data.length)

      await adapter.put(TEST_BUCKET, 'file.txt', data, metadata)

      const deleted = await adapter.deleteBucket(TEST_BUCKET)
      expect(deleted).toBe(false)
      expect(await adapter.bucketExists(TEST_BUCKET)).toBe(true)
    })

    it('should return false when deleting non-existent bucket', async () => {
      const deleted = await adapter.deleteBucket('non-existent')
      expect(deleted).toBe(false)
    })

    it('should handle creating bucket that already exists', async () => {
      await adapter.createBucket(TEST_BUCKET)
      const exists = await adapter.bucketExists(TEST_BUCKET)
      expect(exists).toBe(true)
    })
  })

  // ==========================================================================
  // Basic CRUD Operations
  // ==========================================================================

  describe('Basic CRUD Operations', () => {
    describe('put', () => {
      it('should store an object', async () => {
        const data = createTestData('Hello, World!')
        const metadata = createTestMetadata('hello.txt', TEST_BUCKET, {
          contentType: 'text/plain',
          size: String(data.length),
        })

        const result = await adapter.put(TEST_BUCKET, 'hello.txt', data, metadata)

        expect(result).toBeDefined()
        expect(result.data.toString()).toBe('Hello, World!')
        expect(result.metadata.name).toBe('hello.txt')
        expect(result.metadata.contentType).toBe('text/plain')
      })

      it('should auto-create bucket when putting object', async () => {
        const newBucket = 'auto-created-bucket'
        const data = createTestData()
        const metadata = createTestMetadata('file.txt', newBucket)
        metadata.size = String(data.length)

        await adapter.put(newBucket, 'file.txt', data, metadata)

        expect(await adapter.bucketExists(newBucket)).toBe(true)
      })

      it('should store object with custom metadata', async () => {
        const data = createTestData()
        const metadata = createTestMetadata('with-meta.txt', TEST_BUCKET, {
          size: String(data.length),
          metadata: { author: 'Test', version: '1.0' },
        })

        const result = await adapter.put(TEST_BUCKET, 'with-meta.txt', data, metadata)

        expect(result.metadata.metadata).toEqual({ author: 'Test', version: '1.0' })
      })

      it('should preserve versions when overwriting', async () => {
        const data1 = createTestData('version 1')
        const metadata1 = createTestMetadata('versioned.txt', TEST_BUCKET, {
          generation: '1000',
          size: String(data1.length),
        })
        await adapter.put(TEST_BUCKET, 'versioned.txt', data1, metadata1)

        const data2 = createTestData('version 2')
        const metadata2 = createTestMetadata('versioned.txt', TEST_BUCKET, {
          generation: '2000',
          size: String(data2.length),
        })
        await adapter.put(TEST_BUCKET, 'versioned.txt', data2, metadata2)

        // Get current version
        const current = await adapter.get(TEST_BUCKET, 'versioned.txt')
        expect(current?.data.toString()).toBe('version 2')

        // Get old version
        const oldVersion = await adapter.get(TEST_BUCKET, 'versioned.txt', '1000')
        expect(oldVersion?.data.toString()).toBe('version 1')
      })
    })

    describe('get', () => {
      it('should retrieve an existing object', async () => {
        const data = createTestData('test content')
        const metadata = createTestMetadata('test.txt', TEST_BUCKET, {
          size: String(data.length),
        })
        await adapter.put(TEST_BUCKET, 'test.txt', data, metadata)

        const result = await adapter.get(TEST_BUCKET, 'test.txt')

        expect(result).not.toBeNull()
        expect(result?.data.toString()).toBe('test content')
      })

      it('should return null for non-existent object', async () => {
        const result = await adapter.get(TEST_BUCKET, 'non-existent.txt')
        expect(result).toBeNull()
      })

      it('should return null for non-existent bucket', async () => {
        const result = await adapter.get('non-existent-bucket', 'file.txt')
        expect(result).toBeNull()
      })

      it('should get specific generation', async () => {
        const data1 = createTestData('version 1')
        const metadata1 = createTestMetadata('file.txt', TEST_BUCKET, {
          generation: '1000',
          size: String(data1.length),
        })
        await adapter.put(TEST_BUCKET, 'file.txt', data1, metadata1)

        const data2 = createTestData('version 2')
        const metadata2 = createTestMetadata('file.txt', TEST_BUCKET, {
          generation: '2000',
          size: String(data2.length),
        })
        await adapter.put(TEST_BUCKET, 'file.txt', data2, metadata2)

        const v1 = await adapter.get(TEST_BUCKET, 'file.txt', '1000')
        const v2 = await adapter.get(TEST_BUCKET, 'file.txt', '2000')

        expect(v1?.data.toString()).toBe('version 1')
        expect(v2?.data.toString()).toBe('version 2')
      })

      it('should return null for non-existent generation', async () => {
        const data = createTestData()
        const metadata = createTestMetadata('file.txt', TEST_BUCKET, {
          generation: '1000',
          size: String(data.length),
        })
        await adapter.put(TEST_BUCKET, 'file.txt', data, metadata)

        const result = await adapter.get(TEST_BUCKET, 'file.txt', '9999')
        expect(result).toBeNull()
      })
    })

    describe('delete', () => {
      it('should delete an existing object', async () => {
        const data = createTestData()
        const metadata = createTestMetadata('to-delete.txt', TEST_BUCKET, {
          size: String(data.length),
        })
        await adapter.put(TEST_BUCKET, 'to-delete.txt', data, metadata)

        const deleted = await adapter.delete(TEST_BUCKET, 'to-delete.txt')
        expect(deleted).toBe(true)

        const result = await adapter.get(TEST_BUCKET, 'to-delete.txt')
        expect(result).toBeNull()
      })

      it('should return false for non-existent object', async () => {
        const deleted = await adapter.delete(TEST_BUCKET, 'non-existent.txt')
        expect(deleted).toBe(false)
      })

      it('should return false for non-existent bucket', async () => {
        const deleted = await adapter.delete('non-existent-bucket', 'file.txt')
        expect(deleted).toBe(false)
      })

      it('should delete specific generation', async () => {
        const data1 = createTestData('version 1')
        const metadata1 = createTestMetadata('file.txt', TEST_BUCKET, {
          generation: '1000',
          size: String(data1.length),
        })
        await adapter.put(TEST_BUCKET, 'file.txt', data1, metadata1)

        const data2 = createTestData('version 2')
        const metadata2 = createTestMetadata('file.txt', TEST_BUCKET, {
          generation: '2000',
          size: String(data2.length),
        })
        await adapter.put(TEST_BUCKET, 'file.txt', data2, metadata2)

        // Delete old version
        const deleted = await adapter.delete(TEST_BUCKET, 'file.txt', '1000')
        expect(deleted).toBe(true)

        // Current version should still exist
        const current = await adapter.get(TEST_BUCKET, 'file.txt')
        expect(current?.data.toString()).toBe('version 2')

        // Old version should be gone
        const oldVersion = await adapter.get(TEST_BUCKET, 'file.txt', '1000')
        expect(oldVersion).toBeNull()
      })

      it('should delete entire object when deleting current generation', async () => {
        const data = createTestData()
        const metadata = createTestMetadata('file.txt', TEST_BUCKET, {
          generation: '1000',
          size: String(data.length),
        })
        await adapter.put(TEST_BUCKET, 'file.txt', data, metadata)

        const deleted = await adapter.delete(TEST_BUCKET, 'file.txt', '1000')
        expect(deleted).toBe(true)

        const result = await adapter.get(TEST_BUCKET, 'file.txt')
        expect(result).toBeNull()
      })
    })

    describe('exists', () => {
      it('should return true for existing object', async () => {
        const data = createTestData()
        const metadata = createTestMetadata('exists.txt', TEST_BUCKET, {
          size: String(data.length),
        })
        await adapter.put(TEST_BUCKET, 'exists.txt', data, metadata)

        const exists = await adapter.exists(TEST_BUCKET, 'exists.txt')
        expect(exists).toBe(true)
      })

      it('should return false for non-existent object', async () => {
        const exists = await adapter.exists(TEST_BUCKET, 'non-existent.txt')
        expect(exists).toBe(false)
      })

      it('should return false for non-existent bucket', async () => {
        const exists = await adapter.exists('non-existent-bucket', 'file.txt')
        expect(exists).toBe(false)
      })
    })
  })

  // ==========================================================================
  // List Operations
  // ==========================================================================

  describe('List Operations', () => {
    beforeEach(async () => {
      // Create test objects for listing
      const objects = [
        'file1.txt',
        'file2.txt',
        'file3.txt',
        'folder1/file1.txt',
        'folder1/file2.txt',
        'folder1/subfolder/deep.txt',
        'folder2/file1.txt',
        'folder2/file2.txt',
      ]

      for (const path of objects) {
        const data = createTestData(`content of ${path}`)
        const metadata = createTestMetadata(path, TEST_BUCKET, {
          size: String(data.length),
        })
        await adapter.put(TEST_BUCKET, path, data, metadata)
      }
    })

    it('should list all objects in a bucket', async () => {
      const result = await adapter.list(TEST_BUCKET)

      expect(result.items).toHaveLength(8)
      expect(result.prefixes).toHaveLength(0)
    })

    it('should return empty result for non-existent bucket', async () => {
      const result = await adapter.list('non-existent-bucket')

      expect(result.items).toHaveLength(0)
      expect(result.prefixes).toHaveLength(0)
    })

    it('should filter by prefix', async () => {
      const result = await adapter.list(TEST_BUCKET, { prefix: 'folder1/' })

      expect(result.items).toHaveLength(3)
      result.items.forEach((item) => {
        expect(item.metadata.name.startsWith('folder1/')).toBe(true)
      })
    })

    it('should return empty result for non-matching prefix', async () => {
      const result = await adapter.list(TEST_BUCKET, { prefix: 'nonexistent/' })

      expect(result.items).toHaveLength(0)
    })

    it('should handle delimiter for hierarchical listing', async () => {
      const result = await adapter.list(TEST_BUCKET, {
        prefix: '',
        delimiter: '/',
      })

      // Should have root files and folder prefixes
      expect(result.items).toHaveLength(3) // file1.txt, file2.txt, file3.txt
      expect(result.prefixes).toContain('folder1/')
      expect(result.prefixes).toContain('folder2/')
    })

    it('should handle delimiter at nested level', async () => {
      const result = await adapter.list(TEST_BUCKET, {
        prefix: 'folder1/',
        delimiter: '/',
      })

      expect(result.items).toHaveLength(2) // file1.txt, file2.txt
      expect(result.prefixes).toContain('folder1/subfolder/')
    })

    it('should support pagination with maxResults', async () => {
      const result = await adapter.list(TEST_BUCKET, { maxResults: 3 })

      expect(result.items).toHaveLength(3)
      expect(result.nextPageToken).toBeDefined()
    })

    it('should support pagination with pageToken', async () => {
      const firstPage = await adapter.list(TEST_BUCKET, { maxResults: 3 })
      const secondPage = await adapter.list(TEST_BUCKET, {
        maxResults: 3,
        pageToken: firstPage.nextPageToken,
      })

      expect(secondPage.items.length).toBeGreaterThan(0)

      // Ensure no duplicates
      const firstNames = firstPage.items.map((i) => i.metadata.name)
      const secondNames = secondPage.items.map((i) => i.metadata.name)
      const duplicates = firstNames.filter((n) => secondNames.includes(n))
      expect(duplicates).toHaveLength(0)
    })

    it('should iterate through all pages', async () => {
      const allItems: typeof adapter extends InMemoryAdapter
        ? Awaited<ReturnType<typeof adapter.list>>['items']
        : never = []
      let pageToken: string | undefined

      do {
        const result = await adapter.list(TEST_BUCKET, {
          maxResults: 2,
          pageToken,
        })
        allItems.push(...result.items)
        pageToken = result.nextPageToken
      } while (pageToken)

      expect(allItems).toHaveLength(8)
    })

    it('should filter by startOffset', async () => {
      const result = await adapter.list(TEST_BUCKET, {
        startOffset: 'folder1/',
      })

      result.items.forEach((item) => {
        expect(item.metadata.name >= 'folder1/').toBe(true)
      })
    })

    it('should filter by endOffset', async () => {
      const result = await adapter.list(TEST_BUCKET, {
        endOffset: 'folder1/',
      })

      result.items.forEach((item) => {
        expect(item.metadata.name < 'folder1/').toBe(true)
      })
    })

    it('should include versions when requested', async () => {
      // Create an object with multiple versions
      const data1 = createTestData('version 1')
      const metadata1 = createTestMetadata('versioned.txt', TEST_BUCKET, {
        generation: '1000',
        size: String(data1.length),
      })
      await adapter.put(TEST_BUCKET, 'versioned.txt', data1, metadata1)

      const data2 = createTestData('version 2')
      const metadata2 = createTestMetadata('versioned.txt', TEST_BUCKET, {
        generation: '2000',
        size: String(data2.length),
      })
      await adapter.put(TEST_BUCKET, 'versioned.txt', data2, metadata2)

      const result = await adapter.list(TEST_BUCKET, {
        prefix: 'versioned',
        versions: true,
      })

      // Should include both current and previous version
      expect(result.items.length).toBeGreaterThanOrEqual(2)
    })

    it('should sort items by name', async () => {
      const result = await adapter.list(TEST_BUCKET)

      const names = result.items.map((i) => i.metadata.name)
      const sortedNames = [...names].sort()
      expect(names).toEqual(sortedNames)
    })
  })

  // ==========================================================================
  // Update Metadata Operations
  // ==========================================================================

  describe('Update Metadata Operations', () => {
    it('should update content type', async () => {
      const data = createTestData()
      const metadata = createTestMetadata('file.txt', TEST_BUCKET, {
        contentType: 'text/plain',
        size: String(data.length),
      })
      await adapter.put(TEST_BUCKET, 'file.txt', data, metadata)

      const updated = await adapter.updateMetadata(TEST_BUCKET, 'file.txt', {
        contentType: 'application/json',
      })

      expect(updated?.metadata.contentType).toBe('application/json')
    })

    it('should increment metageneration', async () => {
      const data = createTestData()
      const metadata = createTestMetadata('file.txt', TEST_BUCKET, {
        metageneration: '1',
        size: String(data.length),
      })
      await adapter.put(TEST_BUCKET, 'file.txt', data, metadata)

      const updated = await adapter.updateMetadata(TEST_BUCKET, 'file.txt', {
        contentType: 'application/json',
      })

      expect(updated?.metadata.metageneration).toBe('2')
    })

    it('should update custom metadata', async () => {
      const data = createTestData()
      const metadata = createTestMetadata('file.txt', TEST_BUCKET, {
        size: String(data.length),
        metadata: { original: 'value' },
      })
      await adapter.put(TEST_BUCKET, 'file.txt', data, metadata)

      const updated = await adapter.updateMetadata(TEST_BUCKET, 'file.txt', {
        metadata: { newKey: 'newValue' },
      })

      expect(updated?.metadata.metadata).toEqual({ newKey: 'newValue' })
    })

    it('should clear custom metadata when set to empty object', async () => {
      const data = createTestData()
      const metadata = createTestMetadata('file.txt', TEST_BUCKET, {
        size: String(data.length),
        metadata: { toRemove: 'value' },
      })
      await adapter.put(TEST_BUCKET, 'file.txt', data, metadata)

      const updated = await adapter.updateMetadata(TEST_BUCKET, 'file.txt', {
        metadata: {},
      })

      expect(updated?.metadata.metadata).toBeUndefined()
    })

    it('should update cache control', async () => {
      const data = createTestData()
      const metadata = createTestMetadata('file.txt', TEST_BUCKET, {
        size: String(data.length),
      })
      await adapter.put(TEST_BUCKET, 'file.txt', data, metadata)

      const updated = await adapter.updateMetadata(TEST_BUCKET, 'file.txt', {
        cacheControl: 'public, max-age=3600',
      })

      expect(updated?.metadata.cacheControl).toBe('public, max-age=3600')
    })

    it('should return null for non-existent object', async () => {
      const updated = await adapter.updateMetadata(TEST_BUCKET, 'non-existent.txt', {
        contentType: 'application/json',
      })

      expect(updated).toBeNull()
    })

    it('should return null for non-existent bucket', async () => {
      const updated = await adapter.updateMetadata('non-existent-bucket', 'file.txt', {
        contentType: 'application/json',
      })

      expect(updated).toBeNull()
    })

    it('should update timestamp', async () => {
      const data = createTestData()
      const originalTime = '2020-01-01T00:00:00.000Z'
      const metadata = createTestMetadata('file.txt', TEST_BUCKET, {
        size: String(data.length),
        updated: originalTime,
      })
      await adapter.put(TEST_BUCKET, 'file.txt', data, metadata)

      const updated = await adapter.updateMetadata(TEST_BUCKET, 'file.txt', {
        contentType: 'application/json',
      })

      expect(updated?.metadata.updated).not.toBe(originalTime)
      expect(new Date(updated!.metadata.updated).getTime()).toBeGreaterThan(
        new Date(originalTime).getTime()
      )
    })
  })

  // ==========================================================================
  // Clear and Stats Operations
  // ==========================================================================

  describe('Clear and Stats Operations', () => {
    it('should clear all data', async () => {
      const data = createTestData()
      const metadata = createTestMetadata('file.txt', TEST_BUCKET, {
        size: String(data.length),
      })
      await adapter.put(TEST_BUCKET, 'file.txt', data, metadata)

      await adapter.clear()

      expect(await adapter.bucketExists(TEST_BUCKET)).toBe(false)
      const result = await adapter.get(TEST_BUCKET, 'file.txt')
      expect(result).toBeNull()
    })

    it('should return accurate stats', async () => {
      // Clear and start fresh
      await adapter.clear()
      await adapter.createBucket('bucket1')
      await adapter.createBucket('bucket2')

      const data1 = createTestData('12345') // 5 bytes
      const metadata1 = createTestMetadata('file1.txt', 'bucket1', {
        size: String(data1.length),
      })
      await adapter.put('bucket1', 'file1.txt', data1, metadata1)

      const data2 = createTestData('1234567890') // 10 bytes
      const metadata2 = createTestMetadata('file2.txt', 'bucket2', {
        size: String(data2.length),
      })
      await adapter.put('bucket2', 'file2.txt', data2, metadata2)

      const stats = await adapter.getStats()

      expect(stats.bucketCount).toBe(2)
      expect(stats.objectCount).toBe(2)
      expect(stats.totalSizeBytes).toBe(15)
      expect(stats.buckets['bucket1'].objectCount).toBe(1)
      expect(stats.buckets['bucket1'].sizeBytes).toBe(5)
      expect(stats.buckets['bucket2'].objectCount).toBe(1)
      expect(stats.buckets['bucket2'].sizeBytes).toBe(10)
    })

    it('should include versions in stats', async () => {
      await adapter.clear()
      await adapter.createBucket(TEST_BUCKET)

      const data1 = createTestData('12345')
      const metadata1 = createTestMetadata('file.txt', TEST_BUCKET, {
        generation: '1000',
        size: String(data1.length),
      })
      await adapter.put(TEST_BUCKET, 'file.txt', data1, metadata1)

      const data2 = createTestData('1234567890')
      const metadata2 = createTestMetadata('file.txt', TEST_BUCKET, {
        generation: '2000',
        size: String(data2.length),
      })
      await adapter.put(TEST_BUCKET, 'file.txt', data2, metadata2)

      const stats = await adapter.getStats()

      // Should count both current version and previous version
      expect(stats.objectCount).toBe(2)
      expect(stats.totalSizeBytes).toBe(15) // 5 + 10 bytes
    })
  })

  // ==========================================================================
  // Collection Index Tests
  // ==========================================================================

  describe('Collection Index', () => {
    beforeEach(async () => {
      // Create test objects with nested paths
      const objects = [
        'users/123/profile.json',
        'users/123/settings.json',
        'users/456/profile.json',
        'products/electronics/phone.json',
        'products/electronics/laptop.json',
        'products/clothing/shirt.json',
      ]

      for (const path of objects) {
        const data = createTestData(`content of ${path}`)
        const metadata = createTestMetadata(path, TEST_BUCKET, {
          size: String(data.length),
        })
        await adapter.put(TEST_BUCKET, path, data, metadata)
      }
    })

    it('should build collection index on put', async () => {
      const stats = adapter.getCollectionIndexStats(TEST_BUCKET)

      expect(stats).not.toBeNull()
      expect(stats!.totalIndexedPaths).toBe(6)
      expect(stats!.totalPrefixes).toBeGreaterThan(0)
    })

    it('should use index for efficient prefix queries', async () => {
      const result = await adapter.list(TEST_BUCKET, { prefix: 'users/123/' })

      expect(result.items).toHaveLength(2)
      result.items.forEach((item) => {
        expect(item.metadata.name.startsWith('users/123/')).toBe(true)
      })
    })

    it('should update index on delete', async () => {
      await adapter.delete(TEST_BUCKET, 'users/123/profile.json')

      const result = await adapter.list(TEST_BUCKET, { prefix: 'users/123/' })
      expect(result.items).toHaveLength(1)
    })

    it('should rebuild index correctly', async () => {
      const statsBefore = adapter.getCollectionIndexStats(TEST_BUCKET)

      adapter.rebuildCollectionIndex(TEST_BUCKET)

      const statsAfter = adapter.getCollectionIndexStats(TEST_BUCKET)

      expect(statsAfter!.totalIndexedPaths).toBe(statsBefore!.totalIndexedPaths)
    })

    it('should return null for non-existent bucket stats', () => {
      const stats = adapter.getCollectionIndexStats('non-existent')
      expect(stats).toBeNull()
    })
  })
})
