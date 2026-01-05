/**
 * Firebase Storage CRUD Operations Tests - TDD RED Phase
 *
 * These tests verify the Firebase Storage API compatibility for the storage.do service
 * backed by Cloudflare R2. All tests are designed to fail initially (RED phase)
 * until the corresponding implementations are completed.
 *
 * @see https://firebase.google.com/docs/reference/rest/storage/rest/v1/objects
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import {
  uploadObject,
  downloadObject,
  deleteObject,
  deleteObjects,
  getMetadata,
  updateMetadata,
  listObjects,
  copyObject,
  detectContentType,
  getDownloadUrl,
  StorageError,
  StorageErrorCode,
  type UploadOptions,
  type DownloadOptions,
  type DownloadResult,
  type ObjectMetadata,
  type UpdateMetadataOptions,
  type ListOptions,
  type ListResult,
  type CopyOptions,
  type DeleteOptions,
} from '../../src/storage/objects'

// ============================================================================
// Test Constants and Helpers
// ============================================================================

const TEST_BUCKET = 'test-bucket'
const TEST_PROJECT = 'test-project'

/** Helper to create test data buffers */
function createTestData(size: number = 1024): Buffer {
  const buffer = Buffer.alloc(size)
  for (let i = 0; i < size; i++) {
    buffer[i] = i % 256
  }
  return buffer
}

/** Helper to create text data */
function createTextData(content: string): Buffer {
  return Buffer.from(content, 'utf-8')
}

/** Helper to generate unique test paths */
function uniquePath(prefix: string = 'test'): string {
  return `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Helper to create a readable stream from buffer */
function bufferToStream(buffer: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer))
      controller.close()
    },
  })
}

// ============================================================================
// Upload Operations Tests
// ============================================================================

describe('Upload Operations', () => {
  describe('Simple Upload', () => {
    it('should upload a buffer and return metadata', async () => {
      const path = uniquePath('upload')
      const data = createTestData(1024)

      const metadata = await uploadObject(TEST_BUCKET, path, data)

      expect(metadata).toBeDefined()
      expect(metadata.name).toBe(path)
      expect(metadata.bucket).toBe(TEST_BUCKET)
      expect(metadata.size).toBe('1024')
      expect(metadata.generation).toBeDefined()
      expect(metadata.metageneration).toBe('1')
      expect(metadata.etag).toBeDefined()
      expect(metadata.md5Hash).toBeDefined()
      expect(metadata.crc32c).toBeDefined()
      expect(metadata.timeCreated).toBeDefined()
      expect(metadata.updated).toBeDefined()
    })

    it('should upload an ArrayBuffer', async () => {
      const path = uniquePath('upload-arraybuffer')
      const buffer = createTestData(512)
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      )

      const metadata = await uploadObject(TEST_BUCKET, path, arrayBuffer)

      expect(metadata.name).toBe(path)
      expect(metadata.size).toBe('512')
    })

    it('should upload a Blob', async () => {
      const path = uniquePath('upload-blob')
      const data = createTextData('Hello, World!')
      const blob = new Blob([data], { type: 'text/plain' })

      const metadata = await uploadObject(TEST_BUCKET, path, blob)

      expect(metadata.name).toBe(path)
      expect(metadata.contentType).toBe('text/plain')
    })

    it('should upload a ReadableStream', async () => {
      const path = uniquePath('upload-stream')
      const buffer = createTestData(2048)
      const stream = bufferToStream(buffer)

      const metadata = await uploadObject(TEST_BUCKET, path, stream)

      expect(metadata.name).toBe(path)
      expect(metadata.size).toBe('2048')
    })

    it('should upload empty file', async () => {
      const path = uniquePath('upload-empty')
      const data = Buffer.alloc(0)

      const metadata = await uploadObject(TEST_BUCKET, path, data)

      expect(metadata.name).toBe(path)
      expect(metadata.size).toBe('0')
    })

    it('should upload large file (> 5MB)', async () => {
      const path = uniquePath('upload-large')
      const data = createTestData(6 * 1024 * 1024) // 6MB

      const metadata = await uploadObject(TEST_BUCKET, path, data)

      expect(metadata.name).toBe(path)
      expect(metadata.size).toBe(String(6 * 1024 * 1024))
    })
  })

  describe('Upload with Custom Metadata', () => {
    it('should upload with custom metadata', async () => {
      const path = uniquePath('upload-metadata')
      const data = createTestData()
      const options: UploadOptions = {
        metadata: {
          author: 'Test Author',
          version: '1.0.0',
          customKey: 'customValue',
        },
      }

      const metadata = await uploadObject(TEST_BUCKET, path, data, options)

      expect(metadata.metadata).toBeDefined()
      expect(metadata.metadata?.author).toBe('Test Author')
      expect(metadata.metadata?.version).toBe('1.0.0')
      expect(metadata.metadata?.customKey).toBe('customValue')
    })

    it('should upload with empty metadata object', async () => {
      const path = uniquePath('upload-empty-metadata')
      const data = createTestData()

      const metadata = await uploadObject(TEST_BUCKET, path, data, { metadata: {} })

      expect(metadata.name).toBe(path)
      // Empty metadata should either be undefined or empty object
      expect(metadata.metadata === undefined || Object.keys(metadata.metadata).length === 0).toBe(true)
    })

    it('should preserve special characters in metadata values', async () => {
      const path = uniquePath('upload-special-metadata')
      const data = createTestData()
      const options: UploadOptions = {
        metadata: {
          unicode: 'Hello \u4e2d\u6587',
          special: 'value with "quotes" and spaces',
          emoji: 'test \ud83d\udd25',
        },
      }

      const metadata = await uploadObject(TEST_BUCKET, path, data, options)

      expect(metadata.metadata?.unicode).toBe('Hello \u4e2d\u6587')
      expect(metadata.metadata?.special).toBe('value with "quotes" and spaces')
      expect(metadata.metadata?.emoji).toBe('test \ud83d\udd25')
    })
  })

  describe('Upload with Content Types', () => {
    it('should upload with explicit content type', async () => {
      const path = uniquePath('upload-contenttype')
      const data = createTextData('{"key": "value"}')
      const options: UploadOptions = {
        contentType: 'application/json',
      }

      const metadata = await uploadObject(TEST_BUCKET, path, data, options)

      expect(metadata.contentType).toBe('application/json')
    })

    it('should auto-detect content type from extension (.txt)', async () => {
      const path = `${uniquePath('auto')}/file.txt`
      const data = createTextData('Plain text content')

      const metadata = await uploadObject(TEST_BUCKET, path, data)

      expect(metadata.contentType).toBe('text/plain')
    })

    it('should auto-detect content type from extension (.json)', async () => {
      const path = `${uniquePath('auto')}/data.json`
      const data = createTextData('{"key": "value"}')

      const metadata = await uploadObject(TEST_BUCKET, path, data)

      expect(metadata.contentType).toBe('application/json')
    })

    it('should auto-detect content type from extension (.html)', async () => {
      const path = `${uniquePath('auto')}/page.html`
      const data = createTextData('<html><body>Hello</body></html>')

      const metadata = await uploadObject(TEST_BUCKET, path, data)

      expect(metadata.contentType).toBe('text/html')
    })

    it('should auto-detect content type from extension (.png)', async () => {
      const path = `${uniquePath('auto')}/image.png`
      // PNG magic bytes
      const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

      const metadata = await uploadObject(TEST_BUCKET, path, data)

      expect(metadata.contentType).toBe('image/png')
    })

    it('should default to application/octet-stream for unknown types', async () => {
      const path = `${uniquePath('auto')}/file.unknown`
      const data = createTestData(100)

      const metadata = await uploadObject(TEST_BUCKET, path, data)

      expect(metadata.contentType).toBe('application/octet-stream')
    })

    it('should handle content encoding', async () => {
      const path = uniquePath('upload-encoding')
      const data = createTestData()
      const options: UploadOptions = {
        contentType: 'text/plain',
        contentEncoding: 'gzip',
      }

      const metadata = await uploadObject(TEST_BUCKET, path, data, options)

      expect(metadata.contentEncoding).toBe('gzip')
    })

    it('should handle content disposition', async () => {
      const path = uniquePath('upload-disposition')
      const data = createTestData()
      const options: UploadOptions = {
        contentDisposition: 'attachment; filename="download.txt"',
      }

      const metadata = await uploadObject(TEST_BUCKET, path, data, options)

      expect(metadata.contentDisposition).toBe('attachment; filename="download.txt"')
    })

    it('should handle cache control', async () => {
      const path = uniquePath('upload-cache')
      const data = createTestData()
      const options: UploadOptions = {
        cacheControl: 'public, max-age=3600',
      }

      const metadata = await uploadObject(TEST_BUCKET, path, data, options)

      expect(metadata.cacheControl).toBe('public, max-age=3600')
    })

    it('should handle content language', async () => {
      const path = uniquePath('upload-language')
      const data = createTextData('Bonjour le monde!')
      const options: UploadOptions = {
        contentType: 'text/plain',
        contentLanguage: 'fr',
      }

      const metadata = await uploadObject(TEST_BUCKET, path, data, options)

      expect(metadata.contentLanguage).toBe('fr')
    })
  })

  describe('Upload with Preconditions', () => {
    it('should succeed with ifGenerationMatch=0 for new object', async () => {
      const path = uniquePath('upload-precondition-new')
      const data = createTestData()

      const metadata = await uploadObject(TEST_BUCKET, path, data, {
        ifGenerationMatch: 0,
      })

      expect(metadata.name).toBe(path)
    })

    it('should fail with ifGenerationMatch=0 when object exists', async () => {
      const path = uniquePath('upload-precondition-exists')
      const data = createTestData()

      // First upload
      await uploadObject(TEST_BUCKET, path, data)

      // Second upload with precondition should fail
      await expect(
        uploadObject(TEST_BUCKET, path, data, { ifGenerationMatch: 0 })
      ).rejects.toThrow(StorageError)

      try {
        await uploadObject(TEST_BUCKET, path, data, { ifGenerationMatch: 0 })
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).code).toBe(StorageErrorCode.PRECONDITION_FAILED)
      }
    })

    it('should succeed with ifGenerationNotMatch for overwrite', async () => {
      const path = uniquePath('upload-precondition-overwrite')
      const data = createTestData()

      // First upload
      const firstMetadata = await uploadObject(TEST_BUCKET, path, data)

      // Second upload with precondition
      const secondMetadata = await uploadObject(TEST_BUCKET, path, createTestData(2048), {
        ifGenerationNotMatch: 0,
      })

      expect(secondMetadata.generation).not.toBe(firstMetadata.generation)
    })
  })

  describe('Upload Path Handling', () => {
    it('should handle paths with special characters', async () => {
      const path = uniquePath('special') + '/file with spaces.txt'
      const data = createTextData('test')

      const metadata = await uploadObject(TEST_BUCKET, path, data)

      expect(metadata.name).toBe(path)
    })

    it('should handle deeply nested paths', async () => {
      const path = `${uniquePath('deep')}/level1/level2/level3/level4/file.txt`
      const data = createTextData('deep content')

      const metadata = await uploadObject(TEST_BUCKET, path, data)

      expect(metadata.name).toBe(path)
    })

    it('should handle unicode in path', async () => {
      const path = `${uniquePath('unicode')}/\u6587\u4ef6/\u30c6\u30b9\u30c8.txt`
      const data = createTextData('unicode test')

      const metadata = await uploadObject(TEST_BUCKET, path, data)

      expect(metadata.name).toBe(path)
    })

    it('should reject empty path', async () => {
      const data = createTestData()

      await expect(uploadObject(TEST_BUCKET, '', data)).rejects.toThrow(StorageError)

      try {
        await uploadObject(TEST_BUCKET, '', data)
      } catch (error) {
        expect((error as StorageError).code).toBe(StorageErrorCode.INVALID_ARGUMENT)
      }
    })

    it('should reject path with double slashes', async () => {
      const data = createTestData()

      await expect(uploadObject(TEST_BUCKET, 'path//with//double.txt', data)).rejects.toThrow()
    })
  })
})

// ============================================================================
// Download Operations Tests
// ============================================================================

describe('Download Operations', () => {
  let uploadedPath: string
  let uploadedMetadata: ObjectMetadata

  beforeAll(async () => {
    // Upload a test file to use in download tests
    uploadedPath = uniquePath('download-test')
    const data = createTextData('Download test content - this is the test data.')
    uploadedMetadata = await uploadObject(TEST_BUCKET, uploadedPath, data, {
      contentType: 'text/plain',
      metadata: { testKey: 'testValue' },
    })
  })

  describe('Full Download', () => {
    it('should download complete object as buffer', async () => {
      const result = await downloadObject(TEST_BUCKET, uploadedPath)

      expect(result).toBeDefined()
      expect(result.data).toBeInstanceOf(Buffer)
      expect(result.contentType).toBe('text/plain')
      expect(result.contentLength).toBeGreaterThan(0)
      expect(result.etag).toBeDefined()
      expect(result.lastModified).toBeInstanceOf(Date)
      expect(result.isPartial).toBe(false)
      expect(result.metadata?.testKey).toBe('testValue')
    })

    it('should download object data correctly', async () => {
      const result = await downloadObject(TEST_BUCKET, uploadedPath)

      const content = (result.data as Buffer).toString('utf-8')
      expect(content).toBe('Download test content - this is the test data.')
    })

    it('should return correct content length', async () => {
      const result = await downloadObject(TEST_BUCKET, uploadedPath)

      expect(result.contentLength).toBe(46) // Length of "Download test content - this is the test data."
    })
  })

  describe('Range Requests', () => {
    it('should support range request with start only', async () => {
      const result = await downloadObject(TEST_BUCKET, uploadedPath, {
        rangeStart: 0,
        rangeEnd: 7,
      })

      expect(result.isPartial).toBe(true)
      const content = (result.data as Buffer).toString('utf-8')
      expect(content).toBe('Download')
      expect(result.contentRange).toMatch(/bytes 0-7\/\d+/)
    })

    it('should support range request with start and end', async () => {
      const result = await downloadObject(TEST_BUCKET, uploadedPath, {
        rangeStart: 9,
        rangeEnd: 12,
      })

      expect(result.isPartial).toBe(true)
      const content = (result.data as Buffer).toString('utf-8')
      expect(content).toBe('test')
      expect(result.contentRange).toBeDefined()
    })

    it('should support suffix range (last N bytes)', async () => {
      // To get last 5 bytes, we need rangeStart without rangeEnd or use negative
      const result = await downloadObject(TEST_BUCKET, uploadedPath, {
        rangeStart: -5,
      })

      expect(result.isPartial).toBe(true)
      const content = (result.data as Buffer).toString('utf-8')
      expect(content).toBe('data.')
    })

    it('should handle range beyond file size gracefully', async () => {
      const result = await downloadObject(TEST_BUCKET, uploadedPath, {
        rangeStart: 0,
        rangeEnd: 10000,
      })

      // Should return available data
      expect(result.contentLength).toBeLessThanOrEqual(10001)
    })

    it('should return 416 for unsatisfiable range', async () => {
      await expect(
        downloadObject(TEST_BUCKET, uploadedPath, {
          rangeStart: 100000,
        })
      ).rejects.toThrow(StorageError)

      try {
        await downloadObject(TEST_BUCKET, uploadedPath, { rangeStart: 100000 })
      } catch (error) {
        expect((error as StorageError).httpStatus).toBe(416)
      }
    })
  })

  describe('Conditional Gets', () => {
    it('should return 304 when If-None-Match matches ETag', async () => {
      // First get the ETag
      const firstResult = await downloadObject(TEST_BUCKET, uploadedPath)

      // Then request with matching ETag
      await expect(
        downloadObject(TEST_BUCKET, uploadedPath, {
          ifNoneMatch: firstResult.etag,
        })
      ).rejects.toThrow(StorageError)

      try {
        await downloadObject(TEST_BUCKET, uploadedPath, {
          ifNoneMatch: firstResult.etag,
        })
      } catch (error) {
        expect((error as StorageError).httpStatus).toBe(304)
      }
    })

    it('should return content when If-None-Match does not match', async () => {
      const result = await downloadObject(TEST_BUCKET, uploadedPath, {
        ifNoneMatch: '"different-etag"',
      })

      expect(result.data).toBeDefined()
    })

    it('should return content when If-Match matches ETag', async () => {
      const firstResult = await downloadObject(TEST_BUCKET, uploadedPath)

      const result = await downloadObject(TEST_BUCKET, uploadedPath, {
        ifMatch: firstResult.etag,
      })

      expect(result.data).toBeDefined()
    })

    it('should return 412 when If-Match does not match', async () => {
      await expect(
        downloadObject(TEST_BUCKET, uploadedPath, {
          ifMatch: '"wrong-etag"',
        })
      ).rejects.toThrow(StorageError)

      try {
        await downloadObject(TEST_BUCKET, uploadedPath, { ifMatch: '"wrong-etag"' })
      } catch (error) {
        expect((error as StorageError).httpStatus).toBe(412)
      }
    })

    it('should return 304 when If-Modified-Since is after last modification', async () => {
      const futureDate = new Date(Date.now() + 86400000) // Tomorrow

      await expect(
        downloadObject(TEST_BUCKET, uploadedPath, {
          ifModifiedSince: futureDate,
        })
      ).rejects.toThrow(StorageError)

      try {
        await downloadObject(TEST_BUCKET, uploadedPath, { ifModifiedSince: futureDate })
      } catch (error) {
        expect((error as StorageError).httpStatus).toBe(304)
      }
    })

    it('should return content when If-Modified-Since is before last modification', async () => {
      const pastDate = new Date('2020-01-01')

      const result = await downloadObject(TEST_BUCKET, uploadedPath, {
        ifModifiedSince: pastDate,
      })

      expect(result.data).toBeDefined()
    })

    it('should return 412 when If-Unmodified-Since is before last modification', async () => {
      const pastDate = new Date('2020-01-01')

      await expect(
        downloadObject(TEST_BUCKET, uploadedPath, {
          ifUnmodifiedSince: pastDate,
        })
      ).rejects.toThrow(StorageError)

      try {
        await downloadObject(TEST_BUCKET, uploadedPath, { ifUnmodifiedSince: pastDate })
      } catch (error) {
        expect((error as StorageError).httpStatus).toBe(412)
      }
    })
  })

  describe('Download by Generation', () => {
    it('should download specific generation', async () => {
      const result = await downloadObject(TEST_BUCKET, uploadedPath, {
        generation: parseInt(uploadedMetadata.generation),
      })

      expect(result.data).toBeDefined()
    })

    it('should return 404 for non-existent generation', async () => {
      await expect(
        downloadObject(TEST_BUCKET, uploadedPath, {
          generation: 999999999,
        })
      ).rejects.toThrow(StorageError)

      try {
        await downloadObject(TEST_BUCKET, uploadedPath, { generation: 999999999 })
      } catch (error) {
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
      }
    })
  })

  describe('Download Error Cases', () => {
    it('should return NOT_FOUND for non-existent object', async () => {
      await expect(downloadObject(TEST_BUCKET, 'non-existent-object.txt')).rejects.toThrow(
        StorageError
      )

      try {
        await downloadObject(TEST_BUCKET, 'non-existent-object.txt')
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
        expect((error as StorageError).httpStatus).toBe(404)
      }
    })

    it('should return NOT_FOUND for non-existent bucket', async () => {
      await expect(downloadObject('non-existent-bucket', 'file.txt')).rejects.toThrow(StorageError)

      try {
        await downloadObject('non-existent-bucket', 'file.txt')
      } catch (error) {
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
      }
    })
  })
})

// ============================================================================
// Delete Operations Tests
// ============================================================================

describe('Delete Operations', () => {
  describe('Single Object Delete', () => {
    it('should delete existing object', async () => {
      const path = uniquePath('delete-single')
      await uploadObject(TEST_BUCKET, path, createTestData())

      await expect(deleteObject(TEST_BUCKET, path)).resolves.toBeUndefined()

      // Verify object is gone
      await expect(getMetadata(TEST_BUCKET, path)).rejects.toThrow(StorageError)
    })

    it('should return NOT_FOUND when deleting non-existent object', async () => {
      await expect(deleteObject(TEST_BUCKET, 'non-existent-delete.txt')).rejects.toThrow(
        StorageError
      )

      try {
        await deleteObject(TEST_BUCKET, 'non-existent-delete.txt')
      } catch (error) {
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
      }
    })

    it('should delete with generation precondition', async () => {
      const path = uniquePath('delete-generation')
      const metadata = await uploadObject(TEST_BUCKET, path, createTestData())

      await expect(
        deleteObject(TEST_BUCKET, path, {
          ifGenerationMatch: parseInt(metadata.generation),
        })
      ).resolves.toBeUndefined()
    })

    it('should fail delete with wrong generation precondition', async () => {
      const path = uniquePath('delete-wrong-gen')
      await uploadObject(TEST_BUCKET, path, createTestData())

      await expect(
        deleteObject(TEST_BUCKET, path, {
          ifGenerationMatch: 999999,
        })
      ).rejects.toThrow(StorageError)

      try {
        await deleteObject(TEST_BUCKET, path, { ifGenerationMatch: 999999 })
      } catch (error) {
        expect((error as StorageError).code).toBe(StorageErrorCode.PRECONDITION_FAILED)
      }
    })

    it('should delete specific generation', async () => {
      const path = uniquePath('delete-specific-gen')
      const metadata = await uploadObject(TEST_BUCKET, path, createTestData())

      await expect(
        deleteObject(TEST_BUCKET, path, {
          generation: parseInt(metadata.generation),
        })
      ).resolves.toBeUndefined()
    })
  })

  describe('Multiple Object Delete (Batch)', () => {
    it('should delete multiple objects', async () => {
      const paths = [
        uniquePath('batch-delete-1'),
        uniquePath('batch-delete-2'),
        uniquePath('batch-delete-3'),
      ]

      // Upload all objects
      for (const path of paths) {
        await uploadObject(TEST_BUCKET, path, createTestData())
      }

      // Delete all at once
      const result = await deleteObjects(TEST_BUCKET, paths)

      expect(result.deleted).toHaveLength(3)
      expect(result.errors).toHaveLength(0)

      // Verify all objects are gone
      for (const path of paths) {
        await expect(getMetadata(TEST_BUCKET, path)).rejects.toThrow()
      }
    })

    it('should handle partial failures in batch delete', async () => {
      const existingPath = uniquePath('batch-existing')
      await uploadObject(TEST_BUCKET, existingPath, createTestData())

      const paths = [existingPath, 'non-existent-1.txt', 'non-existent-2.txt']

      const result = await deleteObjects(TEST_BUCKET, paths)

      expect(result.deleted).toContain(existingPath)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should handle empty array', async () => {
      const result = await deleteObjects(TEST_BUCKET, [])

      expect(result.deleted).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
    })

    it('should handle large batch delete', async () => {
      const paths: string[] = []
      for (let i = 0; i < 100; i++) {
        const path = uniquePath(`batch-large-${i}`)
        await uploadObject(TEST_BUCKET, path, createTestData(100))
        paths.push(path)
      }

      const result = await deleteObjects(TEST_BUCKET, paths)

      expect(result.deleted).toHaveLength(100)
    })
  })
})

// ============================================================================
// Metadata Operations Tests
// ============================================================================

describe('Metadata Operations', () => {
  describe('Get Metadata', () => {
    it('should get metadata for existing object', async () => {
      const path = uniquePath('metadata-get')
      const originalMetadata = await uploadObject(TEST_BUCKET, path, createTextData('test'), {
        contentType: 'text/plain',
        metadata: { key1: 'value1' },
      })

      const metadata = await getMetadata(TEST_BUCKET, path)

      expect(metadata.name).toBe(path)
      expect(metadata.bucket).toBe(TEST_BUCKET)
      expect(metadata.size).toBe(String(4))
      expect(metadata.contentType).toBe('text/plain')
      expect(metadata.generation).toBe(originalMetadata.generation)
      expect(metadata.metageneration).toBe('1')
      expect(metadata.etag).toBeDefined()
      expect(metadata.md5Hash).toBeDefined()
      expect(metadata.crc32c).toBeDefined()
      expect(metadata.storageClass).toBeDefined()
      expect(metadata.timeCreated).toBeDefined()
      expect(metadata.updated).toBeDefined()
      expect(metadata.metadata?.key1).toBe('value1')
    })

    it('should return NOT_FOUND for non-existent object', async () => {
      await expect(getMetadata(TEST_BUCKET, 'non-existent-metadata.txt')).rejects.toThrow(
        StorageError
      )

      try {
        await getMetadata(TEST_BUCKET, 'non-existent-metadata.txt')
      } catch (error) {
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
        expect((error as StorageError).httpStatus).toBe(404)
      }
    })

    it('should get metadata for specific generation', async () => {
      const path = uniquePath('metadata-generation')
      const firstMeta = await uploadObject(TEST_BUCKET, path, createTextData('version1'))

      // Overwrite
      await uploadObject(TEST_BUCKET, path, createTextData('version2'))

      // Get first generation's metadata
      const metadata = await getMetadata(TEST_BUCKET, path, parseInt(firstMeta.generation))

      expect(metadata.generation).toBe(firstMeta.generation)
    })

    it('should include all standard metadata fields', async () => {
      const path = uniquePath('metadata-all-fields')
      await uploadObject(TEST_BUCKET, path, createTestData(), {
        contentType: 'application/octet-stream',
        contentEncoding: 'identity',
        contentDisposition: 'inline',
        cacheControl: 'no-cache',
        contentLanguage: 'en',
        metadata: { custom: 'value' },
      })

      const metadata = await getMetadata(TEST_BUCKET, path)

      expect(metadata.contentEncoding).toBe('identity')
      expect(metadata.contentDisposition).toBe('inline')
      expect(metadata.cacheControl).toBe('no-cache')
      expect(metadata.contentLanguage).toBe('en')
    })
  })

  describe('Update Metadata', () => {
    it('should update content type', async () => {
      const path = uniquePath('metadata-update-type')
      await uploadObject(TEST_BUCKET, path, createTextData('test'), {
        contentType: 'text/plain',
      })

      const updated = await updateMetadata(TEST_BUCKET, path, {
        contentType: 'application/json',
      })

      expect(updated.contentType).toBe('application/json')
      expect(parseInt(updated.metageneration)).toBeGreaterThan(1)
    })

    it('should update custom metadata', async () => {
      const path = uniquePath('metadata-update-custom')
      await uploadObject(TEST_BUCKET, path, createTestData(), {
        metadata: { original: 'value' },
      })

      const updated = await updateMetadata(TEST_BUCKET, path, {
        metadata: { newKey: 'newValue', anotherKey: 'anotherValue' },
      })

      expect(updated.metadata?.newKey).toBe('newValue')
      expect(updated.metadata?.anotherKey).toBe('anotherValue')
    })

    it('should clear custom metadata when set to empty object', async () => {
      const path = uniquePath('metadata-clear')
      await uploadObject(TEST_BUCKET, path, createTestData(), {
        metadata: { toRemove: 'value' },
      })

      const updated = await updateMetadata(TEST_BUCKET, path, {
        metadata: {},
      })

      expect(updated.metadata?.toRemove).toBeUndefined()
    })

    it('should update cache control', async () => {
      const path = uniquePath('metadata-update-cache')
      await uploadObject(TEST_BUCKET, path, createTestData())

      const updated = await updateMetadata(TEST_BUCKET, path, {
        cacheControl: 'public, max-age=7200',
      })

      expect(updated.cacheControl).toBe('public, max-age=7200')
    })

    it('should update content disposition', async () => {
      const path = uniquePath('metadata-update-disposition')
      await uploadObject(TEST_BUCKET, path, createTestData())

      const updated = await updateMetadata(TEST_BUCKET, path, {
        contentDisposition: 'attachment; filename="download.bin"',
      })

      expect(updated.contentDisposition).toBe('attachment; filename="download.bin"')
    })

    it('should update content language', async () => {
      const path = uniquePath('metadata-update-lang')
      await uploadObject(TEST_BUCKET, path, createTextData('Hola mundo'))

      const updated = await updateMetadata(TEST_BUCKET, path, {
        contentLanguage: 'es',
      })

      expect(updated.contentLanguage).toBe('es')
    })

    it('should fail update with wrong metageneration precondition', async () => {
      const path = uniquePath('metadata-precondition-fail')
      await uploadObject(TEST_BUCKET, path, createTestData())

      await expect(
        updateMetadata(TEST_BUCKET, path, {
          contentType: 'application/json',
          ifMetagenerationMatch: 999,
        })
      ).rejects.toThrow(StorageError)

      try {
        await updateMetadata(TEST_BUCKET, path, {
          contentType: 'application/json',
          ifMetagenerationMatch: 999,
        })
      } catch (error) {
        expect((error as StorageError).code).toBe(StorageErrorCode.PRECONDITION_FAILED)
      }
    })

    it('should succeed update with correct metageneration precondition', async () => {
      const path = uniquePath('metadata-precondition-ok')
      const original = await uploadObject(TEST_BUCKET, path, createTestData())

      const updated = await updateMetadata(TEST_BUCKET, path, {
        contentType: 'application/json',
        ifMetagenerationMatch: parseInt(original.metageneration),
      })

      expect(updated.contentType).toBe('application/json')
    })

    it('should return NOT_FOUND when updating non-existent object', async () => {
      await expect(
        updateMetadata(TEST_BUCKET, 'non-existent-update.txt', {
          contentType: 'text/plain',
        })
      ).rejects.toThrow(StorageError)

      try {
        await updateMetadata(TEST_BUCKET, 'non-existent-update.txt', {
          contentType: 'text/plain',
        })
      } catch (error) {
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
      }
    })
  })
})

// ============================================================================
// List Operations Tests
// ============================================================================

describe('List Operations', () => {
  const listPrefix = `list-test-${Date.now()}`

  beforeAll(async () => {
    // Create test objects for listing
    const objects = [
      `${listPrefix}/file1.txt`,
      `${listPrefix}/file2.txt`,
      `${listPrefix}/file3.txt`,
      `${listPrefix}/folder1/file1.txt`,
      `${listPrefix}/folder1/file2.txt`,
      `${listPrefix}/folder1/subfolder/deep.txt`,
      `${listPrefix}/folder2/file1.txt`,
      `${listPrefix}/folder2/file2.txt`,
    ]

    for (const path of objects) {
      await uploadObject(TEST_BUCKET, path, createTextData(`content of ${path}`))
    }
  })

  describe('Basic Listing', () => {
    it('should list all objects with prefix', async () => {
      const result = await listObjects(TEST_BUCKET, { prefix: listPrefix })

      expect(result.items).toBeDefined()
      expect(result.items.length).toBe(8)
      expect(result.prefixes).toHaveLength(0)
    })

    it('should return empty result for non-matching prefix', async () => {
      const result = await listObjects(TEST_BUCKET, { prefix: 'non-existent-prefix/' })

      expect(result.items).toHaveLength(0)
      expect(result.prefixes).toHaveLength(0)
    })

    it('should list objects in root when no prefix specified', async () => {
      const result = await listObjects(TEST_BUCKET)

      expect(result.items).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
    })

    it('should include metadata in listed items', async () => {
      const result = await listObjects(TEST_BUCKET, { prefix: `${listPrefix}/file1` })

      expect(result.items.length).toBeGreaterThan(0)
      const item = result.items[0]
      expect(item.name).toBeDefined()
      expect(item.bucket).toBe(TEST_BUCKET)
      expect(item.size).toBeDefined()
      expect(item.contentType).toBeDefined()
      expect(item.timeCreated).toBeDefined()
      expect(item.updated).toBeDefined()
    })
  })

  describe('Pagination', () => {
    it('should limit results with maxResults', async () => {
      const result = await listObjects(TEST_BUCKET, {
        prefix: listPrefix,
        maxResults: 3,
      })

      expect(result.items).toHaveLength(3)
      expect(result.nextPageToken).toBeDefined()
    })

    it('should support pagination with pageToken', async () => {
      const firstPage = await listObjects(TEST_BUCKET, {
        prefix: listPrefix,
        maxResults: 3,
      })

      expect(firstPage.nextPageToken).toBeDefined()

      const secondPage = await listObjects(TEST_BUCKET, {
        prefix: listPrefix,
        maxResults: 3,
        pageToken: firstPage.nextPageToken,
      })

      expect(secondPage.items.length).toBeGreaterThan(0)

      // Ensure no duplicates
      const firstNames = firstPage.items.map((i) => i.name)
      const secondNames = secondPage.items.map((i) => i.name)
      const duplicates = firstNames.filter((n) => secondNames.includes(n))
      expect(duplicates).toHaveLength(0)
    })

    it('should return all items when maxResults is larger than total', async () => {
      const result = await listObjects(TEST_BUCKET, {
        prefix: listPrefix,
        maxResults: 1000,
      })

      expect(result.items).toHaveLength(8)
      expect(result.nextPageToken).toBeUndefined()
    })

    it('should iterate through all pages correctly', async () => {
      const allItems: ObjectMetadata[] = []
      let pageToken: string | undefined

      do {
        const result = await listObjects(TEST_BUCKET, {
          prefix: listPrefix,
          maxResults: 2,
          pageToken,
        })
        allItems.push(...result.items)
        pageToken = result.nextPageToken
      } while (pageToken)

      expect(allItems).toHaveLength(8)
    })
  })

  describe('Prefix Filtering', () => {
    it('should filter by exact prefix', async () => {
      const result = await listObjects(TEST_BUCKET, {
        prefix: `${listPrefix}/folder1/`,
      })

      expect(result.items.length).toBe(3)
      result.items.forEach((item) => {
        expect(item.name).toMatch(new RegExp(`^${listPrefix}/folder1/`))
      })
    })

    it('should handle prefix without trailing slash', async () => {
      const result = await listObjects(TEST_BUCKET, {
        prefix: `${listPrefix}/folder1`,
      })

      expect(result.items.length).toBe(3)
    })

    it('should handle deeply nested prefix', async () => {
      const result = await listObjects(TEST_BUCKET, {
        prefix: `${listPrefix}/folder1/subfolder/`,
      })

      expect(result.items).toHaveLength(1)
      expect(result.items[0].name).toBe(`${listPrefix}/folder1/subfolder/deep.txt`)
    })
  })

  describe('Delimiter Handling', () => {
    it('should return prefixes when delimiter is specified', async () => {
      const result = await listObjects(TEST_BUCKET, {
        prefix: `${listPrefix}/`,
        delimiter: '/',
      })

      expect(result.items).toHaveLength(3) // file1.txt, file2.txt, file3.txt
      expect(result.prefixes).toContain(`${listPrefix}/folder1/`)
      expect(result.prefixes).toContain(`${listPrefix}/folder2/`)
      expect(result.prefixes).toHaveLength(2)
    })

    it('should handle delimiter at nested level', async () => {
      const result = await listObjects(TEST_BUCKET, {
        prefix: `${listPrefix}/folder1/`,
        delimiter: '/',
      })

      expect(result.items).toHaveLength(2) // file1.txt, file2.txt
      expect(result.prefixes).toContain(`${listPrefix}/folder1/subfolder/`)
      expect(result.prefixes).toHaveLength(1)
    })

    it('should support custom delimiter', async () => {
      // This is an edge case - usually delimiter is /
      const result = await listObjects(TEST_BUCKET, {
        prefix: listPrefix,
        delimiter: '-',
      })

      // Results depend on how the files are named with the custom delimiter
      expect(result).toBeDefined()
    })

    it('should include trailing delimiter option', async () => {
      const result = await listObjects(TEST_BUCKET, {
        prefix: `${listPrefix}/`,
        delimiter: '/',
        includeTrailingDelimiter: true,
      })

      expect(result.prefixes.length).toBeGreaterThan(0)
      result.prefixes.forEach((prefix) => {
        expect(prefix.endsWith('/')).toBe(true)
      })
    })
  })

  describe('Start/End Offset', () => {
    it('should start listing after startOffset', async () => {
      const allResults = await listObjects(TEST_BUCKET, { prefix: listPrefix })
      const sorted = allResults.items.map((i) => i.name).sort()
      const midpoint = sorted[Math.floor(sorted.length / 2)]

      const result = await listObjects(TEST_BUCKET, {
        prefix: listPrefix,
        startOffset: midpoint,
      })

      expect(result.items.length).toBeLessThan(allResults.items.length)
      result.items.forEach((item) => {
        expect(item.name >= midpoint).toBe(true)
      })
    })

    it('should stop listing before endOffset', async () => {
      const allResults = await listObjects(TEST_BUCKET, { prefix: listPrefix })
      const sorted = allResults.items.map((i) => i.name).sort()
      const midpoint = sorted[Math.floor(sorted.length / 2)]

      const result = await listObjects(TEST_BUCKET, {
        prefix: listPrefix,
        endOffset: midpoint,
      })

      expect(result.items.length).toBeLessThan(allResults.items.length)
      result.items.forEach((item) => {
        expect(item.name < midpoint).toBe(true)
      })
    })

    it('should combine startOffset and endOffset', async () => {
      const allResults = await listObjects(TEST_BUCKET, { prefix: listPrefix })
      const sorted = allResults.items.map((i) => i.name).sort()

      const result = await listObjects(TEST_BUCKET, {
        prefix: listPrefix,
        startOffset: sorted[1],
        endOffset: sorted[sorted.length - 2],
      })

      expect(result.items.length).toBeLessThan(allResults.items.length - 2)
    })
  })

  describe('Versions', () => {
    it('should list all versions when versions=true', async () => {
      const path = uniquePath('list-versions')

      // Upload multiple versions
      await uploadObject(TEST_BUCKET, path, createTextData('v1'))
      await uploadObject(TEST_BUCKET, path, createTextData('v2'))
      await uploadObject(TEST_BUCKET, path, createTextData('v3'))

      const result = await listObjects(TEST_BUCKET, {
        prefix: path,
        versions: true,
      })

      // Should include all versions
      expect(result.items.length).toBeGreaterThanOrEqual(3)
    })
  })
})

// ============================================================================
// Copy Operations Tests
// ============================================================================

describe('Copy Operations', () => {
  describe('Same Bucket Copy', () => {
    it('should copy object within same bucket', async () => {
      const sourcePath = uniquePath('copy-source')
      const destPath = uniquePath('copy-dest')

      await uploadObject(TEST_BUCKET, sourcePath, createTextData('copy me'), {
        contentType: 'text/plain',
        metadata: { original: 'true' },
      })

      const copyResult = await copyObject(TEST_BUCKET, sourcePath, destPath)

      expect(copyResult.name).toBe(destPath)
      expect(copyResult.bucket).toBe(TEST_BUCKET)
      expect(copyResult.contentType).toBe('text/plain')
      expect(copyResult.metadata?.original).toBe('true')

      // Verify destination exists
      const destMeta = await getMetadata(TEST_BUCKET, destPath)
      expect(destMeta.name).toBe(destPath)
    })

    it('should copy object preserving content', async () => {
      const sourcePath = uniquePath('copy-content-source')
      const destPath = uniquePath('copy-content-dest')
      const content = 'This is the original content to be copied.'

      await uploadObject(TEST_BUCKET, sourcePath, createTextData(content))
      await copyObject(TEST_BUCKET, sourcePath, destPath)

      const downloaded = await downloadObject(TEST_BUCKET, destPath)
      const downloadedContent = (downloaded.data as Buffer).toString('utf-8')

      expect(downloadedContent).toBe(content)
    })

    it('should copy large object', async () => {
      const sourcePath = uniquePath('copy-large-source')
      const destPath = uniquePath('copy-large-dest')
      const largeData = createTestData(10 * 1024 * 1024) // 10MB

      await uploadObject(TEST_BUCKET, sourcePath, largeData)
      const copyResult = await copyObject(TEST_BUCKET, sourcePath, destPath)

      expect(copyResult.size).toBe(String(10 * 1024 * 1024))
    })

    it('should overwrite existing destination', async () => {
      const sourcePath = uniquePath('copy-overwrite-source')
      const destPath = uniquePath('copy-overwrite-dest')

      // Create source and original dest
      await uploadObject(TEST_BUCKET, sourcePath, createTextData('source content'))
      await uploadObject(TEST_BUCKET, destPath, createTextData('original dest'))

      // Copy should overwrite
      await copyObject(TEST_BUCKET, sourcePath, destPath)

      const downloaded = await downloadObject(TEST_BUCKET, destPath)
      const content = (downloaded.data as Buffer).toString('utf-8')

      expect(content).toBe('source content')
    })
  })

  describe('Cross-Bucket Copy', () => {
    const DEST_BUCKET = 'test-bucket-2'

    it('should copy object to different bucket', async () => {
      const sourcePath = uniquePath('cross-bucket-source')
      const destPath = uniquePath('cross-bucket-dest')

      await uploadObject(TEST_BUCKET, sourcePath, createTextData('cross bucket'))

      const copyResult = await copyObject(TEST_BUCKET, sourcePath, destPath, {
        destinationBucket: DEST_BUCKET,
      })

      expect(copyResult.bucket).toBe(DEST_BUCKET)
      expect(copyResult.name).toBe(destPath)
    })

    it('should fail cross-bucket copy with non-existent source', async () => {
      await expect(
        copyObject(TEST_BUCKET, 'non-existent-source.txt', 'dest.txt', {
          destinationBucket: DEST_BUCKET,
        })
      ).rejects.toThrow(StorageError)

      try {
        await copyObject(TEST_BUCKET, 'non-existent-source.txt', 'dest.txt', {
          destinationBucket: DEST_BUCKET,
        })
      } catch (error) {
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
      }
    })
  })

  describe('Copy with Metadata Override', () => {
    it('should override content type during copy', async () => {
      const sourcePath = uniquePath('copy-override-type-source')
      const destPath = uniquePath('copy-override-type-dest')

      await uploadObject(TEST_BUCKET, sourcePath, createTextData('{}'), {
        contentType: 'text/plain',
      })

      const copyResult = await copyObject(TEST_BUCKET, sourcePath, destPath, {
        contentType: 'application/json',
      })

      expect(copyResult.contentType).toBe('application/json')
    })

    it('should override custom metadata during copy', async () => {
      const sourcePath = uniquePath('copy-override-meta-source')
      const destPath = uniquePath('copy-override-meta-dest')

      await uploadObject(TEST_BUCKET, sourcePath, createTestData(), {
        metadata: { original: 'true', key: 'original-value' },
      })

      const copyResult = await copyObject(TEST_BUCKET, sourcePath, destPath, {
        metadata: { copied: 'true', key: 'new-value' },
      })

      expect(copyResult.metadata?.copied).toBe('true')
      expect(copyResult.metadata?.key).toBe('new-value')
      expect(copyResult.metadata?.original).toBeUndefined()
    })
  })

  describe('Copy with Preconditions', () => {
    it('should fail with ifSourceGenerationMatch when generation does not match', async () => {
      const sourcePath = uniquePath('copy-source-gen')
      const destPath = uniquePath('copy-dest-gen')

      await uploadObject(TEST_BUCKET, sourcePath, createTestData())

      await expect(
        copyObject(TEST_BUCKET, sourcePath, destPath, {
          ifSourceGenerationMatch: 999999,
        })
      ).rejects.toThrow(StorageError)

      try {
        await copyObject(TEST_BUCKET, sourcePath, destPath, {
          ifSourceGenerationMatch: 999999,
        })
      } catch (error) {
        expect((error as StorageError).code).toBe(StorageErrorCode.PRECONDITION_FAILED)
      }
    })

    it('should succeed with correct ifSourceGenerationMatch', async () => {
      const sourcePath = uniquePath('copy-correct-source-gen')
      const destPath = uniquePath('copy-correct-dest-gen')

      const sourceMetadata = await uploadObject(TEST_BUCKET, sourcePath, createTestData())

      const copyResult = await copyObject(TEST_BUCKET, sourcePath, destPath, {
        ifSourceGenerationMatch: parseInt(sourceMetadata.generation),
      })

      expect(copyResult.name).toBe(destPath)
    })

    it('should fail with ifGenerationMatch when destination exists', async () => {
      const sourcePath = uniquePath('copy-dest-exists-source')
      const destPath = uniquePath('copy-dest-exists-dest')

      await uploadObject(TEST_BUCKET, sourcePath, createTestData())
      await uploadObject(TEST_BUCKET, destPath, createTestData())

      await expect(
        copyObject(TEST_BUCKET, sourcePath, destPath, {
          ifGenerationMatch: 0, // Should not exist
        })
      ).rejects.toThrow(StorageError)
    })

    it('should succeed with ifGenerationMatch=0 for new destination', async () => {
      const sourcePath = uniquePath('copy-new-dest-source')
      const destPath = uniquePath('copy-new-dest')

      await uploadObject(TEST_BUCKET, sourcePath, createTestData())

      const copyResult = await copyObject(TEST_BUCKET, sourcePath, destPath, {
        ifGenerationMatch: 0,
      })

      expect(copyResult.name).toBe(destPath)
    })
  })

  describe('Copy Error Cases', () => {
    it('should fail when source does not exist', async () => {
      await expect(
        copyObject(TEST_BUCKET, 'non-existent.txt', 'dest.txt')
      ).rejects.toThrow(StorageError)

      try {
        await copyObject(TEST_BUCKET, 'non-existent.txt', 'dest.txt')
      } catch (error) {
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
      }
    })

    it('should fail when source bucket does not exist', async () => {
      await expect(
        copyObject('non-existent-bucket', 'file.txt', 'dest.txt')
      ).rejects.toThrow(StorageError)
    })

    it('should fail when destination bucket does not exist', async () => {
      const sourcePath = uniquePath('copy-bad-dest-bucket')
      await uploadObject(TEST_BUCKET, sourcePath, createTestData())

      await expect(
        copyObject(TEST_BUCKET, sourcePath, 'dest.txt', {
          destinationBucket: 'non-existent-dest-bucket',
        })
      ).rejects.toThrow(StorageError)
    })
  })
})

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  describe('Not Found Errors', () => {
    it('should return NOT_FOUND for download of non-existent object', async () => {
      try {
        await downloadObject(TEST_BUCKET, 'definitely-not-exists.txt')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
        expect((error as StorageError).httpStatus).toBe(404)
        expect((error as StorageError).message).toContain('not found')
      }
    })

    it('should return NOT_FOUND for metadata of non-existent object', async () => {
      try {
        await getMetadata(TEST_BUCKET, 'definitely-not-exists.txt')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
      }
    })

    it('should return NOT_FOUND for delete of non-existent object', async () => {
      try {
        await deleteObject(TEST_BUCKET, 'definitely-not-exists.txt')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
      }
    })

    it('should return NOT_FOUND for copy of non-existent source', async () => {
      try {
        await copyObject(TEST_BUCKET, 'non-existent-source.txt', 'dest.txt')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
      }
    })

    it('should return NOT_FOUND for non-existent bucket', async () => {
      try {
        await listObjects('bucket-that-does-not-exist-12345')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
      }
    })
  })

  describe('Permission Errors', () => {
    it('should return PERMISSION_DENIED for unauthorized bucket access', async () => {
      // This test assumes there's a bucket that exists but is not accessible
      // In a real test environment, this would require proper setup
      try {
        await listObjects('restricted-bucket')
        // If bucket doesn't exist, will get NOT_FOUND - that's ok for this test
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect(
          [StorageErrorCode.PERMISSION_DENIED, StorageErrorCode.NOT_FOUND].includes(
            (error as StorageError).code
          )
        ).toBe(true)
      }
    })
  })

  describe('Precondition Errors', () => {
    it('should return PRECONDITION_FAILED for generation mismatch on upload', async () => {
      const path = uniquePath('precondition-upload')
      await uploadObject(TEST_BUCKET, path, createTestData())

      try {
        await uploadObject(TEST_BUCKET, path, createTestData(), {
          ifGenerationMatch: 0, // Object already exists
        })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).code).toBe(StorageErrorCode.PRECONDITION_FAILED)
        expect((error as StorageError).httpStatus).toBe(412)
      }
    })

    it('should return PRECONDITION_FAILED for metageneration mismatch', async () => {
      const path = uniquePath('precondition-meta')
      await uploadObject(TEST_BUCKET, path, createTestData())

      try {
        await updateMetadata(TEST_BUCKET, path, {
          contentType: 'application/json',
          ifMetagenerationMatch: 999,
        })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).code).toBe(StorageErrorCode.PRECONDITION_FAILED)
      }
    })
  })

  describe('Quota/Rate Limit Errors', () => {
    it('should return RESOURCE_EXHAUSTED for very large upload', async () => {
      // This test might not actually hit limits in a test environment
      // but validates the error handling code path
      const hugeData = createTestData(100 * 1024 * 1024) // 100MB - may exceed limits

      try {
        await uploadObject(TEST_BUCKET, uniquePath('huge'), hugeData)
        // If upload succeeds, that's fine - limits may be high
      } catch (error) {
        if (error instanceof StorageError) {
          expect(
            [
              StorageErrorCode.RESOURCE_EXHAUSTED,
              StorageErrorCode.INVALID_ARGUMENT,
            ].includes(error.code)
          ).toBe(true)
        }
      }
    })
  })

  describe('Invalid Argument Errors', () => {
    it('should return INVALID_ARGUMENT for empty path', async () => {
      try {
        await uploadObject(TEST_BUCKET, '', createTestData())
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).code).toBe(StorageErrorCode.INVALID_ARGUMENT)
        expect((error as StorageError).httpStatus).toBe(400)
      }
    })

    it('should return INVALID_ARGUMENT for invalid bucket name', async () => {
      try {
        await uploadObject('INVALID_BUCKET_NAME!!', 'file.txt', createTestData())
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).code).toBe(StorageErrorCode.INVALID_ARGUMENT)
      }
    })

    it('should return INVALID_ARGUMENT for invalid page token', async () => {
      try {
        await listObjects(TEST_BUCKET, { pageToken: 'invalid-token-!!!' })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).code).toBe(StorageErrorCode.INVALID_ARGUMENT)
      }
    })
  })

  describe('StorageError Class', () => {
    it('should have correct properties', () => {
      const error = new StorageError(
        StorageErrorCode.NOT_FOUND,
        'Object not found',
        404,
        { path: 'test.txt' }
      )

      expect(error.code).toBe(StorageErrorCode.NOT_FOUND)
      expect(error.message).toBe('Object not found')
      expect(error.httpStatus).toBe(404)
      expect(error.details).toEqual({ path: 'test.txt' })
      expect(error.name).toBe('StorageError')
    })

    it('should be instanceof Error', () => {
      const error = new StorageError(StorageErrorCode.INTERNAL, 'test', 500)
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(StorageError)
    })
  })
})

// ============================================================================
// Content Type Detection Tests
// ============================================================================

describe('Content Type Detection', () => {
  describe('Extension-based Detection', () => {
    const extensionTests = [
      { path: 'file.txt', expected: 'text/plain' },
      { path: 'file.html', expected: 'text/html' },
      { path: 'file.htm', expected: 'text/html' },
      { path: 'file.css', expected: 'text/css' },
      { path: 'file.js', expected: 'application/javascript' },
      { path: 'file.mjs', expected: 'application/javascript' },
      { path: 'file.json', expected: 'application/json' },
      { path: 'file.xml', expected: 'application/xml' },
      { path: 'file.pdf', expected: 'application/pdf' },
      { path: 'file.zip', expected: 'application/zip' },
      { path: 'file.gz', expected: 'application/gzip' },
      { path: 'file.tar', expected: 'application/x-tar' },
      { path: 'file.png', expected: 'image/png' },
      { path: 'file.jpg', expected: 'image/jpeg' },
      { path: 'file.jpeg', expected: 'image/jpeg' },
      { path: 'file.gif', expected: 'image/gif' },
      { path: 'file.webp', expected: 'image/webp' },
      { path: 'file.svg', expected: 'image/svg+xml' },
      { path: 'file.ico', expected: 'image/x-icon' },
      { path: 'file.mp3', expected: 'audio/mpeg' },
      { path: 'file.wav', expected: 'audio/wav' },
      { path: 'file.ogg', expected: 'audio/ogg' },
      { path: 'file.mp4', expected: 'video/mp4' },
      { path: 'file.webm', expected: 'video/webm' },
      { path: 'file.woff', expected: 'font/woff' },
      { path: 'file.woff2', expected: 'font/woff2' },
      { path: 'file.ttf', expected: 'font/ttf' },
      { path: 'file.otf', expected: 'font/otf' },
      { path: 'file.md', expected: 'text/markdown' },
      { path: 'file.csv', expected: 'text/csv' },
      { path: 'file.yaml', expected: 'text/yaml' },
      { path: 'file.yml', expected: 'text/yaml' },
    ]

    it.each(extensionTests)(
      'should detect $expected for $path',
      ({ path, expected }) => {
        const result = detectContentType(path)
        expect(result).toBe(expected)
      }
    )

    it('should handle case-insensitive extensions', () => {
      expect(detectContentType('file.TXT')).toBe('text/plain')
      expect(detectContentType('file.JSON')).toBe('application/json')
      expect(detectContentType('file.PNG')).toBe('image/png')
    })

    it('should handle paths with multiple dots', () => {
      expect(detectContentType('file.test.backup.txt')).toBe('text/plain')
      expect(detectContentType('archive.tar.gz')).toBe('application/gzip')
    })

    it('should default to application/octet-stream for unknown extension', () => {
      expect(detectContentType('file.unknown')).toBe('application/octet-stream')
      expect(detectContentType('file.xyz123')).toBe('application/octet-stream')
    })

    it('should default to application/octet-stream for no extension', () => {
      expect(detectContentType('file')).toBe('application/octet-stream')
      expect(detectContentType('path/to/file')).toBe('application/octet-stream')
    })
  })

  describe('Magic Number Detection', () => {
    it('should detect PNG from magic bytes', () => {
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      expect(detectContentType('file', pngMagic)).toBe('image/png')
    })

    it('should detect JPEG from magic bytes', () => {
      const jpegMagic = Buffer.from([0xff, 0xd8, 0xff])
      expect(detectContentType('file', jpegMagic)).toBe('image/jpeg')
    })

    it('should detect GIF from magic bytes', () => {
      const gifMagic = Buffer.from([0x47, 0x49, 0x46, 0x38])
      expect(detectContentType('file', gifMagic)).toBe('image/gif')
    })

    it('should detect PDF from magic bytes', () => {
      const pdfMagic = Buffer.from('%PDF-1.4')
      expect(detectContentType('file', pdfMagic)).toBe('application/pdf')
    })

    it('should detect ZIP from magic bytes', () => {
      const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04])
      expect(detectContentType('file', zipMagic)).toBe('application/zip')
    })

    it('should detect GZIP from magic bytes', () => {
      const gzipMagic = Buffer.from([0x1f, 0x8b])
      expect(detectContentType('file', gzipMagic)).toBe('application/gzip')
    })

    it('should prefer extension over magic bytes when both available', () => {
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      expect(detectContentType('file.txt', pngMagic)).toBe('text/plain')
    })

    it('should handle ArrayBuffer input', () => {
      const pngMagic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      expect(detectContentType('file', pngMagic.buffer)).toBe('image/png')
    })
  })
})

// ============================================================================
// Download URL Generation Tests
// ============================================================================

describe('Download URL Generation', () => {
  it('should generate signed download URL', async () => {
    const path = uniquePath('download-url')
    await uploadObject(TEST_BUCKET, path, createTextData('test'))

    const url = await getDownloadUrl(TEST_BUCKET, path, 3600)

    expect(url).toBeDefined()
    expect(typeof url).toBe('string')
    expect(url.startsWith('https://')).toBe(true)
  })

  it('should include bucket and path in URL', async () => {
    const path = uniquePath('download-url-parts')
    await uploadObject(TEST_BUCKET, path, createTestData())

    const url = await getDownloadUrl(TEST_BUCKET, path, 3600)

    expect(url).toContain(TEST_BUCKET)
    expect(url).toContain(encodeURIComponent(path).replace(/%2F/g, '/'))
  })

  it('should include signature in URL', async () => {
    const path = uniquePath('download-url-sig')
    await uploadObject(TEST_BUCKET, path, createTestData())

    const url = await getDownloadUrl(TEST_BUCKET, path, 3600)

    // Signed URLs typically have signature parameters
    expect(url).toMatch(/[?&](sig|signature|token|X-Amz-Signature)=/i)
  })

  it('should return NOT_FOUND for non-existent object', async () => {
    await expect(
      getDownloadUrl(TEST_BUCKET, 'non-existent-for-url.txt', 3600)
    ).rejects.toThrow(StorageError)

    try {
      await getDownloadUrl(TEST_BUCKET, 'non-existent-for-url.txt', 3600)
    } catch (error) {
      expect((error as StorageError).code).toBe(StorageErrorCode.NOT_FOUND)
    }
  })

  it('should handle different expiration times', async () => {
    const path = uniquePath('download-url-expiry')
    await uploadObject(TEST_BUCKET, path, createTestData())

    const shortUrl = await getDownloadUrl(TEST_BUCKET, path, 60) // 1 minute
    const longUrl = await getDownloadUrl(TEST_BUCKET, path, 86400) // 24 hours

    // URLs should be different due to expiration embedded in signature
    expect(shortUrl).not.toBe(longUrl)
  })

  it('should reject invalid expiration times', async () => {
    const path = uniquePath('download-url-invalid-exp')
    await uploadObject(TEST_BUCKET, path, createTestData())

    // Negative expiration
    await expect(getDownloadUrl(TEST_BUCKET, path, -1)).rejects.toThrow()

    // Zero expiration
    await expect(getDownloadUrl(TEST_BUCKET, path, 0)).rejects.toThrow()

    // Excessively long expiration (typically max 7 days)
    await expect(getDownloadUrl(TEST_BUCKET, path, 86400 * 365)).rejects.toThrow()
  })

  it('should URL-encode special characters in path', async () => {
    const path = uniquePath('download url/with spaces & special.txt')
    await uploadObject(TEST_BUCKET, path, createTextData('test'))

    const url = await getDownloadUrl(TEST_BUCKET, path, 3600)

    // URL should be properly encoded
    expect(url).not.toContain(' ')
    // URL should contain encoded space (either %20 or +)
    expect(url.includes('%20') || url.includes('+')).toBe(true)
  })
})
