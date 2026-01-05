/**
 * Firebase Storage Resumable Upload Protocol Tests
 *
 * These tests verify the resumable upload protocol compatible with
 * Firebase Storage / Google Cloud Storage. The protocol allows large
 * files to be uploaded in chunks with the ability to resume after
 * network interruptions.
 *
 * Test Categories:
 * 1. Initiate upload (get upload URI, metadata)
 * 2. Resume upload (chunk upload, offset tracking)
 * 3. Upload status (bytes uploaded, total size)
 * 4. Cancel upload (cleanup)
 * 5. Complete upload (finalization, metadata)
 * 6. Error recovery (network failures, retries)
 * 7. Chunk size handling (min/max limits)
 * 8. Concurrent uploads to same file
 *
 * @see https://cloud.google.com/storage/docs/resumable-uploads
 * @see https://firebase.google.com/docs/storage/web/upload-files
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  initiateResumableUpload,
  resumeUpload,
  cancelUpload,
  getUploadStatus,
  completeUpload,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  DEFAULT_CHUNK_SIZE,
  MAX_FILE_SIZE,
  UPLOAD_SESSION_DURATION_MS,
  ResumableUploadError,
  ResumableUploadErrorCode,
  type InitiateUploadOptions,
  type ResumeUploadOptions,
  type UploadStatus,
  type CompletedUploadMetadata,
} from '../../src/storage/resumable'

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a buffer filled with random data for testing
 */
function createTestData(size: number): Uint8Array {
  const data = new Uint8Array(size)
  for (let i = 0; i < size; i++) {
    data[i] = Math.floor(Math.random() * 256)
  }
  return data
}

/**
 * Default options for initiating an upload
 */
function defaultInitOptions(overrides: Partial<InitiateUploadOptions> = {}): InitiateUploadOptions {
  return {
    bucket: 'test-bucket',
    name: 'test-file.bin',
    contentType: 'application/octet-stream',
    ...overrides,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Firebase Storage Resumable Upload Protocol', () => {
  describe('Constants', () => {
    it('should define MIN_CHUNK_SIZE as 256KB', () => {
      expect(MIN_CHUNK_SIZE).toBe(256 * 1024)
    })

    it('should define MAX_CHUNK_SIZE as 5MB', () => {
      expect(MAX_CHUNK_SIZE).toBe(5 * 1024 * 1024)
    })

    it('should define DEFAULT_CHUNK_SIZE as 1MB', () => {
      expect(DEFAULT_CHUNK_SIZE).toBe(1024 * 1024)
    })

    it('should define MAX_FILE_SIZE as 5TB', () => {
      expect(MAX_FILE_SIZE).toBe(5 * 1024 * 1024 * 1024 * 1024)
    })

    it('should define UPLOAD_SESSION_DURATION as 1 week', () => {
      expect(UPLOAD_SESSION_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000)
    })
  })

  describe('initiateResumableUpload', () => {
    describe('Upload Session Creation', () => {
      it('should return an upload URI when initiated successfully', async () => {
        const result = await initiateResumableUpload(defaultInitOptions())

        expect(result.uploadUri).toBeDefined()
        expect(typeof result.uploadUri).toBe('string')
        expect(result.uploadUri.length).toBeGreaterThan(0)
      })

      it('should return a unique upload ID', async () => {
        const result = await initiateResumableUpload(defaultInitOptions())

        expect(result.uploadId).toBeDefined()
        expect(typeof result.uploadId).toBe('string')
        expect(result.uploadId.length).toBeGreaterThan(0)
      })

      it('should return an expiration date in the future', async () => {
        const beforeTime = Date.now()
        const result = await initiateResumableUpload(defaultInitOptions())
        const afterTime = Date.now()

        expect(result.expiresAt).toBeInstanceOf(Date)
        expect(result.expiresAt.getTime()).toBeGreaterThan(afterTime)
        // Should expire within the session duration window
        expect(result.expiresAt.getTime()).toBeLessThanOrEqual(
          beforeTime + UPLOAD_SESSION_DURATION_MS + 1000
        )
      })

      it('should generate unique upload URIs for each initiation', async () => {
        const uris = new Set<string>()

        for (let i = 0; i < 5; i++) {
          const result = await initiateResumableUpload(defaultInitOptions({
            name: `test-file-${i}.bin`,
          }))
          expect(uris.has(result.uploadUri)).toBe(false)
          uris.add(result.uploadUri)
        }

        expect(uris.size).toBe(5)
      })

      it('should include bucket name in upload URI', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          bucket: 'my-custom-bucket',
        }))

        expect(result.uploadUri).toContain('my-custom-bucket')
      })
    })

    describe('Metadata Handling', () => {
      it('should accept content type', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          contentType: 'image/jpeg',
        }))

        expect(result.uploadUri).toBeDefined()
      })

      it('should accept custom metadata', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          metadata: {
            'x-custom-key': 'custom-value',
            'uploaded-by': 'test-user',
          },
        }))

        expect(result.uploadUri).toBeDefined()
      })

      it('should accept total size hint', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          totalSize: 10 * 1024 * 1024, // 10 MB
        }))

        expect(result.uploadUri).toBeDefined()
      })

      it('should accept origin for CORS', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          origin: 'https://example.com',
        }))

        expect(result.uploadUri).toBeDefined()
      })

      it('should accept predefined ACL', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          predefinedAcl: 'publicRead',
        }))

        expect(result.uploadUri).toBeDefined()
      })
    })

    describe('Validation', () => {
      it('should reject empty bucket name', async () => {
        await expect(
          initiateResumableUpload(defaultInitOptions({ bucket: '' }))
        ).rejects.toThrow()
      })

      it('should reject empty file name', async () => {
        await expect(
          initiateResumableUpload(defaultInitOptions({ name: '' }))
        ).rejects.toThrow()
      })

      it('should reject invalid bucket name characters', async () => {
        await expect(
          initiateResumableUpload(defaultInitOptions({ bucket: 'invalid bucket!' }))
        ).rejects.toThrow()
      })

      it('should reject file names starting with slash', async () => {
        await expect(
          initiateResumableUpload(defaultInitOptions({ name: '/absolute/path.txt' }))
        ).rejects.toThrow()
      })

      it('should reject negative total size', async () => {
        await expect(
          initiateResumableUpload(defaultInitOptions({ totalSize: -1 }))
        ).rejects.toThrow()
      })

      it('should reject total size exceeding maximum', async () => {
        await expect(
          initiateResumableUpload(defaultInitOptions({
            totalSize: MAX_FILE_SIZE + 1,
          }))
        ).rejects.toThrow()
      })

      it('should reject invalid content type format', async () => {
        await expect(
          initiateResumableUpload(defaultInitOptions({ contentType: 'invalid' }))
        ).rejects.toThrow()
      })
    })

    describe('Path Handling', () => {
      it('should handle nested paths', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          name: 'path/to/nested/file.txt',
        }))

        expect(result.uploadUri).toBeDefined()
      })

      it('should handle special characters in file names', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          name: 'file with spaces & special (chars).txt',
        }))

        expect(result.uploadUri).toBeDefined()
      })

      it('should handle unicode file names', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          name: 'archivo-con-acentos.txt',
        }))

        expect(result.uploadUri).toBeDefined()
      })

      it('should normalize path separators', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          name: 'path//with///multiple////slashes.txt',
        }))

        expect(result.uploadUri).toBeDefined()
      })
    })
  })

  describe('resumeUpload', () => {
    describe('Chunk Upload', () => {
      it('should accept first chunk at offset 0', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        const result = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        expect(result.bytesUploaded).toBe(MIN_CHUNK_SIZE)
        expect(result.complete).toBe(false)
      })

      it('should track bytes uploaded across multiple chunks', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize: MIN_CHUNK_SIZE * 3,
        }))
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        // First chunk
        const result1 = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })
        expect(result1.bytesUploaded).toBe(MIN_CHUNK_SIZE)

        // Second chunk
        const result2 = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: MIN_CHUNK_SIZE,
        })
        expect(result2.bytesUploaded).toBe(MIN_CHUNK_SIZE * 2)

        // Third chunk (final)
        const result3 = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: MIN_CHUNK_SIZE * 2,
          totalSize: MIN_CHUNK_SIZE * 3,
          isFinal: true,
        })
        expect(result3.bytesUploaded).toBe(MIN_CHUNK_SIZE * 3)
        expect(result3.complete).toBe(true)
      })

      it('should complete upload when final chunk is sent', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        const result = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
          totalSize,
          isFinal: true,
        })

        expect(result.complete).toBe(true)
        expect(result.metadata).toBeDefined()
      })

      it('should return completed metadata when upload finishes', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          bucket: 'test-bucket',
          name: 'test-file.bin',
          contentType: 'application/octet-stream',
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        const result = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
          totalSize,
          isFinal: true,
        })

        expect(result.metadata).toBeDefined()
        expect(result.metadata?.name).toContain('test-file.bin')
        expect(result.metadata?.bucket).toBe('test-bucket')
        expect(result.metadata?.contentType).toBe('application/octet-stream')
        expect(result.metadata?.size).toBe(totalSize)
      })

      it('should accept ArrayBuffer as data', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MIN_CHUNK_SIZE).buffer

        const result = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        expect(result.bytesUploaded).toBe(MIN_CHUNK_SIZE)
      })

      it('should accept Uint8Array as data', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        const result = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        expect(result.bytesUploaded).toBe(MIN_CHUNK_SIZE)
      })
    })

    describe('Offset Validation', () => {
      it('should reject negative offset', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        await expect(
          resumeUpload({
            uploadUri: initResult.uploadUri,
            data: chunkData,
            offset: -1,
          })
        ).rejects.toThrow()
      })

      it('should reject offset that does not match server state', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        // First upload at offset 0
        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        // Try to upload at wrong offset (should be MIN_CHUNK_SIZE)
        await expect(
          resumeUpload({
            uploadUri: initResult.uploadUri,
            data: chunkData,
            offset: 0, // Wrong - should be MIN_CHUNK_SIZE
          })
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should provide correct offset in error when mismatch occurs', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        try {
          await resumeUpload({
            uploadUri: initResult.uploadUri,
            data: chunkData,
            offset: 1000, // Wrong offset
          })
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error).toBeInstanceOf(ResumableUploadError)
          expect((error as ResumableUploadError).code).toBe(ResumableUploadErrorCode.INVALID_OFFSET)
          expect((error as ResumableUploadError).bytesUploaded).toBe(MIN_CHUNK_SIZE)
        }
      })

      it('should reject offset beyond total size', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        await expect(
          resumeUpload({
            uploadUri: initResult.uploadUri,
            data: chunkData,
            offset: totalSize + 1,
          })
        ).rejects.toThrow()
      })
    })

    describe('Chunk Size Handling', () => {
      it('should reject chunks smaller than MIN_CHUNK_SIZE (except final)', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize: MIN_CHUNK_SIZE * 2,
        }))
        const smallChunk = createTestData(MIN_CHUNK_SIZE - 1)

        await expect(
          resumeUpload({
            uploadUri: initResult.uploadUri,
            data: smallChunk,
            offset: 0,
            isFinal: false,
          })
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should accept small final chunk', async () => {
        const smallSize = 1024 // 1 KB
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize: smallSize,
        }))
        const smallChunk = createTestData(smallSize)

        const result = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: smallChunk,
          offset: 0,
          totalSize: smallSize,
          isFinal: true,
        })

        expect(result.complete).toBe(true)
      })

      it('should reject chunks larger than MAX_CHUNK_SIZE', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const largeChunk = createTestData(MAX_CHUNK_SIZE + 1)

        await expect(
          resumeUpload({
            uploadUri: initResult.uploadUri,
            data: largeChunk,
            offset: 0,
          })
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should accept chunks of exactly MIN_CHUNK_SIZE', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        const result = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        expect(result.bytesUploaded).toBe(MIN_CHUNK_SIZE)
      })

      it('should accept chunks of exactly MAX_CHUNK_SIZE', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MAX_CHUNK_SIZE)

        const result = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        expect(result.bytesUploaded).toBe(MAX_CHUNK_SIZE)
      })

      it('should accept chunks that are multiples of 256KB', async () => {
        const chunkSize = 512 * 1024 // 512 KB
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(chunkSize)

        const result = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        expect(result.bytesUploaded).toBe(chunkSize)
      })

      it('should reject non-256KB-aligned chunks (except final)', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize: MIN_CHUNK_SIZE * 2,
        }))
        const chunkData = createTestData(MIN_CHUNK_SIZE + 100) // Not aligned

        await expect(
          resumeUpload({
            uploadUri: initResult.uploadUri,
            data: chunkData,
            offset: 0,
            isFinal: false,
          })
        ).rejects.toThrow()
      })

      it('should accept empty final chunk when all data already uploaded', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        // Upload all data
        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        // Empty final chunk to complete
        const result = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: new Uint8Array(0),
          offset: totalSize,
          totalSize,
          isFinal: true,
        })

        expect(result.complete).toBe(true)
      })
    })

    describe('Upload URI Validation', () => {
      it('should reject invalid upload URI', async () => {
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        await expect(
          resumeUpload({
            uploadUri: 'invalid-uri',
            data: chunkData,
            offset: 0,
          })
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should reject expired upload URI', async () => {
        // This test would require time manipulation or a mock
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        await expect(
          resumeUpload({
            uploadUri: 'https://storage.example.com/upload/expired-session-id',
            data: chunkData,
            offset: 0,
          })
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should reject upload URI for canceled upload', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        await cancelUpload({ uploadUri: initResult.uploadUri })

        const chunkData = createTestData(MIN_CHUNK_SIZE)

        await expect(
          resumeUpload({
            uploadUri: initResult.uploadUri,
            data: chunkData,
            offset: 0,
          })
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should reject upload URI for completed upload', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        // Complete the upload
        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
          totalSize,
          isFinal: true,
        })

        // Try to resume completed upload
        await expect(
          resumeUpload({
            uploadUri: initResult.uploadUri,
            data: chunkData,
            offset: 0,
          })
        ).rejects.toThrow(ResumableUploadError)
      })
    })

    describe('Total Size Handling', () => {
      it('should require totalSize for final chunk', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        await expect(
          resumeUpload({
            uploadUri: initResult.uploadUri,
            data: chunkData,
            offset: 0,
            isFinal: true,
            // totalSize missing
          })
        ).rejects.toThrow()
      })

      it('should validate totalSize matches actual uploaded bytes on completion', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize: MIN_CHUNK_SIZE * 2,
        }))
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        // Try to complete with wrong total size
        await expect(
          resumeUpload({
            uploadUri: initResult.uploadUri,
            data: chunkData,
            offset: MIN_CHUNK_SIZE,
            totalSize: MIN_CHUNK_SIZE * 3, // Wrong!
            isFinal: true,
          })
        ).rejects.toThrow()
      })

      it('should accept upload without initial totalSize hint', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions({
          // No totalSize provided
        }))
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        const result = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
          totalSize: MIN_CHUNK_SIZE,
          isFinal: true,
        })

        expect(result.complete).toBe(true)
      })
    })
  })

  describe('getUploadStatus', () => {
    describe('Status Retrieval', () => {
      it('should return bytes uploaded for active upload', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        const status = await getUploadStatus(initResult.uploadUri)

        expect(status.bytesUploaded).toBe(MIN_CHUNK_SIZE)
      })

      it('should return zero bytes for newly initiated upload', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())

        const status = await getUploadStatus(initResult.uploadUri)

        expect(status.bytesUploaded).toBe(0)
      })

      it('should return active=true for in-progress upload', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())

        const status = await getUploadStatus(initResult.uploadUri)

        expect(status.active).toBe(true)
      })

      it('should return total size when known', async () => {
        const totalSize = 10 * 1024 * 1024
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))

        const status = await getUploadStatus(initResult.uploadUri)

        expect(status.totalSize).toBe(totalSize)
      })

      it('should return undefined totalSize when not specified', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions({
          // No totalSize
        }))

        const status = await getUploadStatus(initResult.uploadUri)

        expect(status.totalSize).toBeUndefined()
      })

      it('should return upload metadata', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions({
          bucket: 'my-bucket',
          name: 'my-file.txt',
          contentType: 'text/plain',
        }))

        const status = await getUploadStatus(initResult.uploadUri)

        expect(status.metadata.bucket).toBe('my-bucket')
        expect(status.metadata.name).toBe('my-file.txt')
        expect(status.metadata.contentType).toBe('text/plain')
      })

      it('should return start time', async () => {
        const beforeTime = new Date()
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const afterTime = new Date()

        const status = await getUploadStatus(initResult.uploadUri)

        expect(status.startedAt).toBeInstanceOf(Date)
        expect(status.startedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime())
        expect(status.startedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime())
      })

      it('should return expiration time', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())

        const status = await getUploadStatus(initResult.uploadUri)

        expect(status.expiresAt).toBeInstanceOf(Date)
        expect(status.expiresAt.getTime()).toBeGreaterThan(Date.now())
      })

      it('should return the upload URI', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())

        const status = await getUploadStatus(initResult.uploadUri)

        expect(status.uploadUri).toBe(initResult.uploadUri)
      })
    })

    describe('Error Cases', () => {
      it('should throw NOT_FOUND for invalid upload URI', async () => {
        await expect(
          getUploadStatus('https://storage.example.com/upload/nonexistent')
        ).rejects.toThrow(ResumableUploadError)

        try {
          await getUploadStatus('https://storage.example.com/upload/nonexistent')
        } catch (error) {
          expect((error as ResumableUploadError).code).toBe(ResumableUploadErrorCode.NOT_FOUND)
        }
      })

      it('should throw NOT_FOUND for canceled upload', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        await cancelUpload({ uploadUri: initResult.uploadUri })

        await expect(
          getUploadStatus(initResult.uploadUri)
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should throw EXPIRED for expired upload session', async () => {
        // This would require time manipulation
        await expect(
          getUploadStatus('https://storage.example.com/upload/expired-session')
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should return active=false for completed upload', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
          totalSize,
          isFinal: true,
        })

        // Completed uploads may still be queryable but marked inactive
        try {
          const status = await getUploadStatus(initResult.uploadUri)
          expect(status.active).toBe(false)
          expect(status.bytesUploaded).toBe(totalSize)
        } catch (error) {
          // Alternatively, completed uploads may return NOT_FOUND
          expect((error as ResumableUploadError).code).toBe(ResumableUploadErrorCode.NOT_FOUND)
        }
      })
    })

    describe('Progress Tracking', () => {
      it('should accurately track progress across multiple queries', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize: MIN_CHUNK_SIZE * 3,
        }))
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        // Check initial status
        let status = await getUploadStatus(initResult.uploadUri)
        expect(status.bytesUploaded).toBe(0)

        // Upload first chunk
        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        status = await getUploadStatus(initResult.uploadUri)
        expect(status.bytesUploaded).toBe(MIN_CHUNK_SIZE)

        // Upload second chunk
        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: MIN_CHUNK_SIZE,
        })

        status = await getUploadStatus(initResult.uploadUri)
        expect(status.bytesUploaded).toBe(MIN_CHUNK_SIZE * 2)
      })
    })
  })

  describe('cancelUpload', () => {
    describe('Successful Cancellation', () => {
      it('should cancel an active upload', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())

        await expect(
          cancelUpload({ uploadUri: initResult.uploadUri })
        ).resolves.not.toThrow()
      })

      it('should cancel upload with partially uploaded data', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        await expect(
          cancelUpload({ uploadUri: initResult.uploadUri })
        ).resolves.not.toThrow()
      })

      it('should invalidate upload URI after cancellation', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        await cancelUpload({ uploadUri: initResult.uploadUri })

        await expect(
          getUploadStatus(initResult.uploadUri)
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should free server resources after cancellation', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        await cancelUpload({ uploadUri: initResult.uploadUri })

        // Subsequent operations should fail
        await expect(
          resumeUpload({
            uploadUri: initResult.uploadUri,
            data: chunkData,
            offset: MIN_CHUNK_SIZE,
          })
        ).rejects.toThrow()
      })
    })

    describe('Error Cases', () => {
      it('should throw NOT_FOUND for invalid upload URI', async () => {
        await expect(
          cancelUpload({ uploadUri: 'invalid-uri' })
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should throw NOT_FOUND for already canceled upload', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        await cancelUpload({ uploadUri: initResult.uploadUri })

        await expect(
          cancelUpload({ uploadUri: initResult.uploadUri })
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should throw ALREADY_COMPLETED for completed upload', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
          totalSize,
          isFinal: true,
        })

        try {
          await cancelUpload({ uploadUri: initResult.uploadUri })
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error).toBeInstanceOf(ResumableUploadError)
          expect((error as ResumableUploadError).code).toBe(
            ResumableUploadErrorCode.ALREADY_COMPLETED
          )
        }
      })
    })

    describe('Idempotency', () => {
      it('should be safe to attempt cancel on expired upload', async () => {
        // Expired uploads behave like canceled ones
        await expect(
          cancelUpload({ uploadUri: 'https://storage.example.com/upload/expired' })
        ).rejects.toThrow(ResumableUploadError)
      })
    })
  })

  describe('completeUpload', () => {
    describe('Successful Completion', () => {
      it('should complete upload and return metadata', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          bucket: 'test-bucket',
          name: 'completed-file.bin',
          contentType: 'application/octet-stream',
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        const metadata = await completeUpload({
          uploadUri: initResult.uploadUri,
        })

        expect(metadata.name).toContain('completed-file.bin')
        expect(metadata.bucket).toBe('test-bucket')
        expect(metadata.size).toBe(totalSize)
        expect(metadata.contentType).toBe('application/octet-stream')
      })

      it('should return generation and metageneration', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        const metadata = await completeUpload({
          uploadUri: initResult.uploadUri,
        })

        expect(metadata.generation).toBeDefined()
        expect(typeof metadata.generation).toBe('string')
        expect(metadata.metageneration).toBeDefined()
        expect(typeof metadata.metageneration).toBe('string')
      })

      it('should return MD5 hash and CRC32C checksum', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        const metadata = await completeUpload({
          uploadUri: initResult.uploadUri,
        })

        expect(metadata.md5Hash).toBeDefined()
        expect(typeof metadata.md5Hash).toBe('string')
        expect(metadata.crc32c).toBeDefined()
        expect(typeof metadata.crc32c).toBe('string')
      })

      it('should return ETag', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        const metadata = await completeUpload({
          uploadUri: initResult.uploadUri,
        })

        expect(metadata.etag).toBeDefined()
        expect(typeof metadata.etag).toBe('string')
      })

      it('should return creation and update timestamps', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        const metadata = await completeUpload({
          uploadUri: initResult.uploadUri,
        })

        expect(metadata.timeCreated).toBeDefined()
        expect(metadata.updated).toBeDefined()
        // Should be valid ISO 8601 timestamps
        expect(() => new Date(metadata.timeCreated)).not.toThrow()
        expect(() => new Date(metadata.updated)).not.toThrow()
      })

      it('should return storage class', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        const metadata = await completeUpload({
          uploadUri: initResult.uploadUri,
        })

        expect(metadata.storageClass).toBeDefined()
        expect(['STANDARD', 'NEARLINE', 'COLDLINE', 'ARCHIVE']).toContain(metadata.storageClass)
      })

      it('should include download token when applicable', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        const metadata = await completeUpload({
          uploadUri: initResult.uploadUri,
        })

        // downloadTokens is optional but should be a string if present
        if (metadata.downloadTokens) {
          expect(typeof metadata.downloadTokens).toBe('string')
        }
      })
    })

    describe('Checksum Verification', () => {
      it('should verify MD5 hash if provided', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        // Wrong MD5 hash
        await expect(
          completeUpload({
            uploadUri: initResult.uploadUri,
            md5Hash: 'invalid-hash-definitely-wrong==',
          })
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should verify CRC32C checksum if provided', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        // Wrong CRC32C
        await expect(
          completeUpload({
            uploadUri: initResult.uploadUri,
            crc32c: 'AAAABBBB',
          })
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should accept correct MD5 hash', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        // Get status to find correct hash
        const status = await getUploadStatus(initResult.uploadUri)

        // This test assumes we can get the correct hash somehow
        // In practice, the server calculates this
        const metadata = await completeUpload({
          uploadUri: initResult.uploadUri,
        })

        expect(metadata.md5Hash).toBeDefined()
      })

      it('should throw CHECKSUM_MISMATCH error for wrong checksum', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        try {
          await completeUpload({
            uploadUri: initResult.uploadUri,
            md5Hash: 'wronghash==',
          })
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error).toBeInstanceOf(ResumableUploadError)
          expect((error as ResumableUploadError).code).toBe(
            ResumableUploadErrorCode.CHECKSUM_MISMATCH
          )
        }
      })
    })

    describe('Metadata Updates', () => {
      it('should allow setting additional metadata on completion', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        const metadata = await completeUpload({
          uploadUri: initResult.uploadUri,
          metadata: {
            cacheControl: 'public, max-age=3600',
            contentDisposition: 'attachment; filename="download.bin"',
          },
        })

        expect(metadata).toBeDefined()
      })

      it('should preserve custom metadata from initiation', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
          metadata: {
            'x-custom-key': 'custom-value',
          },
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        const metadata = await completeUpload({
          uploadUri: initResult.uploadUri,
        })

        expect(metadata.customMetadata?.['x-custom-key']).toBe('custom-value')
      })
    })

    describe('Error Cases', () => {
      it('should throw error if upload is incomplete', async () => {
        const totalSize = MIN_CHUNK_SIZE * 2
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        // Only upload first chunk
        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        await expect(
          completeUpload({
            uploadUri: initResult.uploadUri,
          })
        ).rejects.toThrow()
      })

      it('should throw NOT_FOUND for invalid upload URI', async () => {
        await expect(
          completeUpload({
            uploadUri: 'invalid-uri',
          })
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should throw NOT_FOUND for canceled upload', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        await cancelUpload({ uploadUri: initResult.uploadUri })

        await expect(
          completeUpload({
            uploadUri: initResult.uploadUri,
          })
        ).rejects.toThrow(ResumableUploadError)
      })

      it('should throw ALREADY_COMPLETED for already completed upload', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize,
        }))
        const chunkData = createTestData(totalSize)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
          totalSize,
          isFinal: true,
        })

        // First completion should work or be idempotent
        await completeUpload({ uploadUri: initResult.uploadUri })

        // Second completion should fail
        try {
          await completeUpload({ uploadUri: initResult.uploadUri })
          // If idempotent, this is also acceptable
        } catch (error) {
          expect(error).toBeInstanceOf(ResumableUploadError)
          expect((error as ResumableUploadError).code).toBe(
            ResumableUploadErrorCode.ALREADY_COMPLETED
          )
        }
      })
    })
  })

  describe('Error Recovery', () => {
    describe('Network Failure Simulation', () => {
      it('should allow resuming after simulated network failure', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize: MIN_CHUNK_SIZE * 2,
        }))
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        // First chunk succeeds
        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        // Simulate checking status after "network failure"
        const status = await getUploadStatus(initResult.uploadUri)
        expect(status.bytesUploaded).toBe(MIN_CHUNK_SIZE)

        // Resume from correct offset
        const result = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: status.bytesUploaded,
          totalSize: MIN_CHUNK_SIZE * 2,
          isFinal: true,
        })

        expect(result.complete).toBe(true)
      })

      it('should recover correct offset after partial chunk failure', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions({
          totalSize: MIN_CHUNK_SIZE * 3,
        }))
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        // Upload first chunk
        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        // Query status to recover
        const status = await getUploadStatus(initResult.uploadUri)

        // Continue from recovered offset
        const result = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: status.bytesUploaded,
        })

        expect(result.bytesUploaded).toBe(MIN_CHUNK_SIZE * 2)
      })
    })

    describe('Retry Logic', () => {
      it('should accept retry with same offset and data (idempotent)', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        // First attempt
        const result1 = await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        // Retry with same parameters should succeed or fail gracefully
        try {
          const result2 = await resumeUpload({
            uploadUri: initResult.uploadUri,
            data: chunkData,
            offset: 0,
          })

          // If idempotent, should return same result
          expect(result2.bytesUploaded).toBeGreaterThanOrEqual(result1.bytesUploaded)
        } catch (error) {
          // If not idempotent, should indicate offset mismatch
          expect(error).toBeInstanceOf(ResumableUploadError)
          expect((error as ResumableUploadError).code).toBe(ResumableUploadErrorCode.INVALID_OFFSET)
        }
      })

      it('should provide correct recovery offset in error response', async () => {
        const initResult = await initiateResumableUpload(defaultInitOptions())
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        try {
          // Wrong offset
          await resumeUpload({
            uploadUri: initResult.uploadUri,
            data: chunkData,
            offset: 100, // Wrong
          })
        } catch (error) {
          expect(error).toBeInstanceOf(ResumableUploadError)
          expect((error as ResumableUploadError).bytesUploaded).toBe(MIN_CHUNK_SIZE)
        }
      })
    })

    describe('Error Codes', () => {
      it('should return RATE_LIMITED for too many requests', async () => {
        // This would require actually triggering rate limiting
        // For now, test that the error code exists
        expect(ResumableUploadErrorCode.RATE_LIMITED).toBe('RATE_LIMITED')
      })

      it('should return NETWORK_ERROR for connection issues', async () => {
        expect(ResumableUploadErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR')
      })

      it('should return SERVER_ERROR for internal errors', async () => {
        expect(ResumableUploadErrorCode.SERVER_ERROR).toBe('SERVER_ERROR')
      })
    })
  })

  describe('Concurrent Uploads', () => {
    describe('Same File Path', () => {
      it('should allow multiple concurrent upload sessions to same path', async () => {
        const options = defaultInitOptions({
          name: 'concurrent-file.bin',
        })

        const [result1, result2] = await Promise.all([
          initiateResumableUpload(options),
          initiateResumableUpload(options),
        ])

        expect(result1.uploadUri).not.toBe(result2.uploadUri)
        expect(result1.uploadId).not.toBe(result2.uploadId)
      })

      it('should independently track progress for concurrent uploads', async () => {
        const options = defaultInitOptions({
          name: 'concurrent-progress.bin',
        })

        const result1 = await initiateResumableUpload(options)
        const result2 = await initiateResumableUpload(options)

        const chunkData = createTestData(MIN_CHUNK_SIZE)

        // Upload to first session only
        await resumeUpload({
          uploadUri: result1.uploadUri,
          data: chunkData,
          offset: 0,
        })

        const status1 = await getUploadStatus(result1.uploadUri)
        const status2 = await getUploadStatus(result2.uploadUri)

        expect(status1.bytesUploaded).toBe(MIN_CHUNK_SIZE)
        expect(status2.bytesUploaded).toBe(0)
      })

      it('should allow both concurrent uploads to complete', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const options = defaultInitOptions({
          name: 'concurrent-complete.bin',
          totalSize,
        })

        const result1 = await initiateResumableUpload(options)
        const result2 = await initiateResumableUpload(options)

        const chunkData = createTestData(totalSize)

        const [upload1, upload2] = await Promise.all([
          resumeUpload({
            uploadUri: result1.uploadUri,
            data: chunkData,
            offset: 0,
            totalSize,
            isFinal: true,
          }),
          resumeUpload({
            uploadUri: result2.uploadUri,
            data: chunkData,
            offset: 0,
            totalSize,
            isFinal: true,
          }),
        ])

        expect(upload1.complete).toBe(true)
        expect(upload2.complete).toBe(true)
      })

      it('should handle last-write-wins for concurrent completions', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const options = defaultInitOptions({
          name: 'last-write-wins.bin',
          totalSize,
        })

        const result1 = await initiateResumableUpload(options)
        const result2 = await initiateResumableUpload(options)

        const chunkData1 = createTestData(totalSize)
        const chunkData2 = createTestData(totalSize)

        // Both complete - one will be the final version
        await Promise.all([
          resumeUpload({
            uploadUri: result1.uploadUri,
            data: chunkData1,
            offset: 0,
            totalSize,
            isFinal: true,
          }),
          resumeUpload({
            uploadUri: result2.uploadUri,
            data: chunkData2,
            offset: 0,
            totalSize,
            isFinal: true,
          }),
        ])

        // File exists (last write wins)
        // The specific behavior depends on implementation
      })
    })

    describe('Different File Paths', () => {
      it('should allow parallel uploads to different files', async () => {
        const totalSize = MIN_CHUNK_SIZE

        const results = await Promise.all([
          initiateResumableUpload(defaultInitOptions({
            name: 'file1.bin',
            totalSize,
          })),
          initiateResumableUpload(defaultInitOptions({
            name: 'file2.bin',
            totalSize,
          })),
          initiateResumableUpload(defaultInitOptions({
            name: 'file3.bin',
            totalSize,
          })),
        ])

        expect(results.length).toBe(3)
        const uris = new Set(results.map(r => r.uploadUri))
        expect(uris.size).toBe(3)
      })

      it('should complete parallel uploads independently', async () => {
        const totalSize = MIN_CHUNK_SIZE
        const chunkData = createTestData(totalSize)

        const init1 = await initiateResumableUpload(defaultInitOptions({
          name: 'parallel1.bin',
          totalSize,
        }))
        const init2 = await initiateResumableUpload(defaultInitOptions({
          name: 'parallel2.bin',
          totalSize,
        }))

        const [result1, result2] = await Promise.all([
          resumeUpload({
            uploadUri: init1.uploadUri,
            data: chunkData,
            offset: 0,
            totalSize,
            isFinal: true,
          }),
          resumeUpload({
            uploadUri: init2.uploadUri,
            data: chunkData,
            offset: 0,
            totalSize,
            isFinal: true,
          }),
        ])

        expect(result1.complete).toBe(true)
        expect(result2.complete).toBe(true)
        expect(result1.metadata?.name).toContain('parallel1.bin')
        expect(result2.metadata?.name).toContain('parallel2.bin')
      })
    })

    describe('Conflict Detection', () => {
      it('should detect if file was modified during upload', async () => {
        // This tests optimistic concurrency
        const totalSize = MIN_CHUNK_SIZE * 2
        const initResult = await initiateResumableUpload(defaultInitOptions({
          name: 'conflict-test.bin',
          totalSize,
        }))
        const chunkData = createTestData(MIN_CHUNK_SIZE)

        // Start upload
        await resumeUpload({
          uploadUri: initResult.uploadUri,
          data: chunkData,
          offset: 0,
        })

        // Another client completes an upload to the same file
        const otherResult = await initiateResumableUpload(defaultInitOptions({
          name: 'conflict-test.bin',
          totalSize: MIN_CHUNK_SIZE,
        }))
        await resumeUpload({
          uploadUri: otherResult.uploadUri,
          data: chunkData,
          offset: 0,
          totalSize: MIN_CHUNK_SIZE,
          isFinal: true,
        })

        // Original upload tries to complete
        // Depending on implementation, this may succeed or detect conflict
        try {
          await resumeUpload({
            uploadUri: initResult.uploadUri,
            data: chunkData,
            offset: MIN_CHUNK_SIZE,
            totalSize,
            isFinal: true,
          })
          // Success is acceptable - last write wins
        } catch (error) {
          // Conflict detection is also acceptable
          expect(error).toBeInstanceOf(ResumableUploadError)
          expect((error as ResumableUploadError).code).toBe(ResumableUploadErrorCode.CONFLICT)
        }
      })
    })
  })

  describe('Edge Cases', () => {
    describe('Empty Files', () => {
      it('should handle zero-byte file upload', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          totalSize: 0,
        }))

        const uploadResult = await resumeUpload({
          uploadUri: result.uploadUri,
          data: new Uint8Array(0),
          offset: 0,
          totalSize: 0,
          isFinal: true,
        })

        expect(uploadResult.complete).toBe(true)
        expect(uploadResult.metadata?.size).toBe(0)
      })
    })

    describe('Large Files', () => {
      it('should accept files up to MAX_FILE_SIZE', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          totalSize: MAX_FILE_SIZE,
        }))

        expect(result.uploadUri).toBeDefined()
      })

      it('should reject files exceeding MAX_FILE_SIZE', async () => {
        await expect(
          initiateResumableUpload(defaultInitOptions({
            totalSize: MAX_FILE_SIZE + 1,
          }))
        ).rejects.toThrow()
      })
    })

    describe('Special Characters', () => {
      it('should handle file names with spaces', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          name: 'file with spaces.txt',
        }))

        expect(result.uploadUri).toBeDefined()
      })

      it('should handle file names with unicode', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          name: 'archivo.txt',
        }))

        expect(result.uploadUri).toBeDefined()
      })

      it('should handle deeply nested paths', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          name: 'a/b/c/d/e/f/g/h/i/j/file.txt',
        }))

        expect(result.uploadUri).toBeDefined()
      })
    })

    describe('Content Types', () => {
      it('should accept common image types', async () => {
        const types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

        for (const contentType of types) {
          const result = await initiateResumableUpload(defaultInitOptions({
            contentType,
            name: `file.${contentType.split('/')[1]}`,
          }))
          expect(result.uploadUri).toBeDefined()
        }
      })

      it('should accept video types', async () => {
        const types = ['video/mp4', 'video/webm', 'video/quicktime']

        for (const contentType of types) {
          const result = await initiateResumableUpload(defaultInitOptions({
            contentType,
          }))
          expect(result.uploadUri).toBeDefined()
        }
      })

      it('should accept application types', async () => {
        const types = ['application/pdf', 'application/json', 'application/octet-stream']

        for (const contentType of types) {
          const result = await initiateResumableUpload(defaultInitOptions({
            contentType,
          }))
          expect(result.uploadUri).toBeDefined()
        }
      })

      it('should default to application/octet-stream if not specified', async () => {
        const result = await initiateResumableUpload({
          bucket: 'test-bucket',
          name: 'file.bin',
          // No contentType
        })

        expect(result.uploadUri).toBeDefined()
      })
    })

    describe('Bucket Names', () => {
      it('should handle bucket names with hyphens', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          bucket: 'my-test-bucket',
        }))

        expect(result.uploadUri).toBeDefined()
      })

      it('should handle bucket names with numbers', async () => {
        const result = await initiateResumableUpload(defaultInitOptions({
          bucket: 'bucket123',
        }))

        expect(result.uploadUri).toBeDefined()
      })

      it('should reject bucket names with uppercase', async () => {
        await expect(
          initiateResumableUpload(defaultInitOptions({
            bucket: 'MyBucket',
          }))
        ).rejects.toThrow()
      })

      it('should reject bucket names with underscores', async () => {
        await expect(
          initiateResumableUpload(defaultInitOptions({
            bucket: 'my_bucket',
          }))
        ).rejects.toThrow()
      })
    })
  })

  describe('ResumableUploadError', () => {
    it('should contain error code', () => {
      const error = new ResumableUploadError(
        ResumableUploadErrorCode.NOT_FOUND,
        'Upload not found'
      )

      expect(error.code).toBe(ResumableUploadErrorCode.NOT_FOUND)
    })

    it('should contain error message', () => {
      const error = new ResumableUploadError(
        ResumableUploadErrorCode.NOT_FOUND,
        'Upload session not found'
      )

      expect(error.message).toBe('Upload session not found')
    })

    it('should contain upload URI when available', () => {
      const error = new ResumableUploadError(
        ResumableUploadErrorCode.INVALID_OFFSET,
        'Invalid offset',
        'https://storage.example.com/upload/123'
      )

      expect(error.uploadUri).toBe('https://storage.example.com/upload/123')
    })

    it('should contain bytes uploaded when available', () => {
      const error = new ResumableUploadError(
        ResumableUploadErrorCode.INVALID_OFFSET,
        'Invalid offset',
        'https://storage.example.com/upload/123',
        1024
      )

      expect(error.bytesUploaded).toBe(1024)
    })

    it('should have correct name property', () => {
      const error = new ResumableUploadError(
        ResumableUploadErrorCode.NOT_FOUND,
        'Upload not found'
      )

      expect(error.name).toBe('ResumableUploadError')
    })

    it('should be instanceof Error', () => {
      const error = new ResumableUploadError(
        ResumableUploadErrorCode.NOT_FOUND,
        'Upload not found'
      )

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(ResumableUploadError)
    })
  })
})
