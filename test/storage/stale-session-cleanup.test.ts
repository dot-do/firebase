/**
 * Stale Upload Session Cleanup Tests
 *
 * These tests verify that abandoned/stale resumable upload sessions
 * are properly cleaned up after timeout periods. This is critical for:
 * - Freeing memory from abandoned uploads
 * - Preventing resource leaks
 * - Ensuring the system remains stable over time
 *
 * Test Categories:
 * 1. Expired session cleanup (past expiresAt)
 * 2. Idle session cleanup (no activity for sessionIdleTimeoutMs)
 * 3. Memory release on cleanup
 * 4. Automatic cleanup timer behavior
 * 5. Edge cases (completed sessions, canceled sessions)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  initiateResumableUpload,
  resumeUpload,
  getUploadStatus,
  cancelUpload,
  cleanupStaleSessions,
  startCleanupTimer,
  stopCleanupTimer,
  getUploadSessionStats,
  resetUploadSessions,
  MIN_CHUNK_SIZE,
  UPLOAD_SESSION_DURATION_MS,
  ResumableUploadError,
  ResumableUploadErrorCode,
  type InitiateUploadOptions,
} from '../../src/storage/resumable'
import {
  updateStorageConfig,
  resetStorageConfig,
  getResumableMemoryUsage,
  resetMemoryTracking,
} from '../../src/storage/config'

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

describe('Stale Upload Session Cleanup', () => {
  beforeEach(() => {
    // Reset state before each test
    resetUploadSessions()
    resetStorageConfig()
    resetMemoryTracking()
    vi.useFakeTimers()
  })

  afterEach(() => {
    // Cleanup after each test
    stopCleanupTimer()
    resetUploadSessions()
    resetStorageConfig()
    resetMemoryTracking()
    vi.useRealTimers()
  })

  describe('Expired Session Cleanup', () => {
    it('should cleanup sessions that have expired (past expiresAt)', async () => {
      // Disable auto cleanup so we can test manual cleanup
      updateStorageConfig({ enableAutoCleanup: false })

      // Create an upload session
      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'expired-test.bin',
      }))

      // Verify session exists
      const statusBefore = await getUploadStatus(result.uploadUri)
      expect(statusBefore.active).toBe(true)

      // Fast forward past the session expiration time (1 week + buffer)
      vi.advanceTimersByTime(UPLOAD_SESSION_DURATION_MS + 1000)

      // Run cleanup
      const cleanupResult = cleanupStaleSessions()

      // Verify session was cleaned up
      expect(cleanupResult.cleanedSessions).toBe(1)
      expect(cleanupResult.cleanedUris).toContain(result.uploadUri)

      // Verify session is no longer accessible
      await expect(getUploadStatus(result.uploadUri)).rejects.toThrow(ResumableUploadError)
    })

    it('should cleanup multiple expired sessions at once', async () => {
      // Disable auto cleanup so we can test manual cleanup
      updateStorageConfig({ enableAutoCleanup: false })

      // Create multiple upload sessions
      const sessions = await Promise.all([
        initiateResumableUpload(defaultInitOptions({ name: 'file1.bin' })),
        initiateResumableUpload(defaultInitOptions({ name: 'file2.bin' })),
        initiateResumableUpload(defaultInitOptions({ name: 'file3.bin' })),
      ])

      // Fast forward past expiration
      vi.advanceTimersByTime(UPLOAD_SESSION_DURATION_MS + 1000)

      // Run cleanup
      const cleanupResult = cleanupStaleSessions()

      // All sessions should be cleaned up
      expect(cleanupResult.cleanedSessions).toBe(3)
      for (const session of sessions) {
        expect(cleanupResult.cleanedUris).toContain(session.uploadUri)
      }
    })

    it('should not cleanup sessions that have not expired', async () => {
      // Disable auto cleanup so we can test manual cleanup
      // Set idle timeout to longer than the test duration (2 days) to avoid idle cleanup
      const twoDays = 2 * 24 * 60 * 60 * 1000
      updateStorageConfig({
        enableAutoCleanup: false,
        sessionIdleTimeoutMs: twoDays,
        cleanupIntervalMs: twoDays,
      })

      // Create an upload session
      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'not-expired.bin',
      }))

      // Advance time but not past expiration (1 day)
      vi.advanceTimersByTime(24 * 60 * 60 * 1000)

      // Run cleanup
      const cleanupResult = cleanupStaleSessions()

      // Session should not be cleaned up
      expect(cleanupResult.cleanedSessions).toBe(0)

      // Session should still be accessible
      const status = await getUploadStatus(result.uploadUri)
      expect(status.active).toBe(true)
    })

    it('should throw EXPIRED when accessing an expired session', async () => {
      // Disable auto cleanup so we can test expiration detection
      updateStorageConfig({ enableAutoCleanup: false })

      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'access-expired.bin',
      }))

      // Fast forward past expiration
      vi.advanceTimersByTime(UPLOAD_SESSION_DURATION_MS + 1000)

      // Attempt to access the expired session
      try {
        await getUploadStatus(result.uploadUri)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ResumableUploadError)
        expect((error as ResumableUploadError).code).toBe(ResumableUploadErrorCode.EXPIRED)
      }
    })
  })

  describe('Idle Session Cleanup', () => {
    it('should cleanup sessions that have been idle too long', async () => {
      // Configure a short idle timeout for testing (30 seconds)
      // Also set cleanupIntervalMs <= sessionIdleTimeoutMs to satisfy validation
      const shortIdleTimeout = 30 * 1000
      updateStorageConfig({
        sessionIdleTimeoutMs: shortIdleTimeout,
        cleanupIntervalMs: shortIdleTimeout,
        enableAutoCleanup: false, // Disable auto cleanup to test manual cleanup
      })

      // Create an upload session
      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'idle-test.bin',
      }))

      // Fast forward past idle timeout
      vi.advanceTimersByTime(shortIdleTimeout + 1000)

      // Run cleanup
      const cleanupResult = cleanupStaleSessions()

      // Session should be cleaned up due to idle timeout
      expect(cleanupResult.cleanedSessions).toBe(1)
      expect(cleanupResult.cleanedUris).toContain(result.uploadUri)
    })

    it('should not cleanup sessions with recent activity', async () => {
      // Configure idle timeout
      // Also set cleanupIntervalMs <= sessionIdleTimeoutMs to satisfy validation
      const idleTimeout = 60 * 1000 // 1 minute
      updateStorageConfig({
        sessionIdleTimeoutMs: idleTimeout,
        cleanupIntervalMs: idleTimeout,
        enableAutoCleanup: false, // Disable auto cleanup to test manual cleanup
      })

      // Create an upload session
      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'active-test.bin',
      }))

      // Wait half the idle timeout
      vi.advanceTimersByTime(idleTimeout / 2)

      // Upload a chunk to update lastActivityAt
      const chunkData = createTestData(MIN_CHUNK_SIZE)
      await resumeUpload({
        uploadUri: result.uploadUri,
        data: chunkData,
        offset: 0,
      })

      // Wait another half the idle timeout (total: 1x idle timeout from start)
      vi.advanceTimersByTime(idleTimeout / 2)

      // Run cleanup - session should NOT be cleaned because we had activity
      const cleanupResult = cleanupStaleSessions()

      // Session should not be cleaned up because of recent activity
      expect(cleanupResult.cleanedSessions).toBe(0)
    })

    it('should reset idle timer on each chunk upload', async () => {
      const idleTimeout = 30 * 1000 // 30 seconds
      updateStorageConfig({ sessionIdleTimeoutMs: idleTimeout, cleanupIntervalMs: idleTimeout })

      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'reset-idle.bin',
        totalSize: MIN_CHUNK_SIZE * 3,
      }))

      const chunkData = createTestData(MIN_CHUNK_SIZE)

      // Upload chunks with delays that would trigger idle timeout if not reset
      for (let i = 0; i < 3; i++) {
        // Advance time by 20 seconds (less than idle timeout)
        vi.advanceTimersByTime(20 * 1000)

        // Upload chunk (this should reset idle timer)
        await resumeUpload({
          uploadUri: result.uploadUri,
          data: chunkData,
          offset: i * MIN_CHUNK_SIZE,
          ...(i === 2 ? { totalSize: MIN_CHUNK_SIZE * 3, isFinal: true } : {}),
        })
      }

      // Wait half the idle timeout after completion
      vi.advanceTimersByTime(idleTimeout / 2)

      // Run cleanup
      const cleanupResult = cleanupStaleSessions()

      // Completed uploads should not be cleaned by idle timeout
      // (They may be kept for idempotency)
      expect(cleanupResult.cleanedSessions).toBe(0)
    })
  })

  describe('Memory Release on Cleanup', () => {
    it('should release memory when cleaning up sessions with uploaded data', async () => {
      // Disable auto cleanup so we can test manual cleanup
      updateStorageConfig({ enableAutoCleanup: false })

      // Create upload session and upload some data
      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'memory-test.bin',
      }))

      const chunkData = createTestData(MIN_CHUNK_SIZE)
      await resumeUpload({
        uploadUri: result.uploadUri,
        data: chunkData,
        offset: 0,
      })

      // Check memory usage
      const memoryBefore = getResumableMemoryUsage()
      expect(memoryBefore).toBe(MIN_CHUNK_SIZE)

      // Fast forward past expiration and cleanup
      vi.advanceTimersByTime(UPLOAD_SESSION_DURATION_MS + 1000)
      const cleanupResult = cleanupStaleSessions()

      // Memory should be freed
      expect(cleanupResult.freedMemory).toBe(MIN_CHUNK_SIZE)
      expect(getResumableMemoryUsage()).toBe(0)
    })

    it('should release memory from multiple sessions on cleanup', async () => {
      // Disable auto cleanup so we can test manual cleanup
      updateStorageConfig({ enableAutoCleanup: false })

      // Create multiple sessions with data
      const sessions = []
      for (let i = 0; i < 3; i++) {
        const result = await initiateResumableUpload(defaultInitOptions({
          name: `memory-multi-${i}.bin`,
        }))

        const chunkData = createTestData(MIN_CHUNK_SIZE)
        await resumeUpload({
          uploadUri: result.uploadUri,
          data: chunkData,
          offset: 0,
        })

        sessions.push(result)
      }

      // Verify memory is allocated
      expect(getResumableMemoryUsage()).toBe(MIN_CHUNK_SIZE * 3)

      // Fast forward and cleanup
      vi.advanceTimersByTime(UPLOAD_SESSION_DURATION_MS + 1000)
      const cleanupResult = cleanupStaleSessions()

      // All memory should be freed
      expect(cleanupResult.freedMemory).toBe(MIN_CHUNK_SIZE * 3)
      expect(getResumableMemoryUsage()).toBe(0)
    })

    it('should not double-release memory if session already cleaned', async () => {
      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'double-cleanup.bin',
      }))

      const chunkData = createTestData(MIN_CHUNK_SIZE)
      await resumeUpload({
        uploadUri: result.uploadUri,
        data: chunkData,
        offset: 0,
      })

      // Cancel the upload (this releases memory)
      await cancelUpload({ uploadUri: result.uploadUri })

      expect(getResumableMemoryUsage()).toBe(0)

      // Running cleanup should not cause issues
      const cleanupResult = cleanupStaleSessions()

      // No sessions to clean (already canceled/deleted)
      expect(cleanupResult.cleanedSessions).toBe(0)
      expect(cleanupResult.freedMemory).toBe(0)
    })
  })

  describe('Automatic Cleanup Timer', () => {
    it('should run cleanup at configured interval', async () => {
      // Configure short cleanup interval for testing
      const idleTimeout = 3000 // 3 seconds
      const cleanupInterval = 3000 // 3 seconds (must be <= idleTimeout)
      updateStorageConfig({
        sessionIdleTimeoutMs: idleTimeout,
        cleanupIntervalMs: cleanupInterval,
        enableAutoCleanup: true,
      })

      // Start cleanup timer
      startCleanupTimer()

      // Create an upload session
      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'auto-cleanup.bin',
      }))

      // Advance time past idle timeout but before first cleanup
      vi.advanceTimersByTime(idleTimeout + 500)

      // Session should still exist (cleanup hasn't run yet)
      const stats1 = getUploadSessionStats()
      expect(stats1.totalSessions).toBe(1)

      // Advance time to trigger cleanup
      vi.advanceTimersByTime(cleanupInterval)

      // Session should now be cleaned up
      const stats2 = getUploadSessionStats()
      expect(stats2.totalSessions).toBe(0)

      // Verify session is not accessible
      await expect(getUploadStatus(result.uploadUri)).rejects.toThrow()
    })

    it('should not run cleanup if disabled', async () => {
      updateStorageConfig({
        enableAutoCleanup: false,
        sessionIdleTimeoutMs: 1000,
        cleanupIntervalMs: 500,
      })

      // Attempting to start timer should have no effect
      startCleanupTimer()

      // Create session
      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'no-auto-cleanup.bin',
      }))

      // Advance time significantly
      vi.advanceTimersByTime(10000)

      // Session should still exist (no auto cleanup)
      const stats = getUploadSessionStats()
      expect(stats.totalSessions).toBe(1)
    })

    it('should stop cleanup timer when requested', async () => {
      updateStorageConfig({
        sessionIdleTimeoutMs: 1000,
        cleanupIntervalMs: 500,
        enableAutoCleanup: true,
      })

      startCleanupTimer()

      // Create session
      await initiateResumableUpload(defaultInitOptions({
        name: 'stop-timer.bin',
      }))

      // Wait for idle timeout
      vi.advanceTimersByTime(600)

      // Stop the timer before cleanup runs
      stopCleanupTimer()

      // Advance past cleanup interval
      vi.advanceTimersByTime(2000)

      // Session should still exist (timer was stopped)
      const stats = getUploadSessionStats()
      expect(stats.totalSessions).toBe(1)
    })
  })

  describe('Edge Cases', () => {
    it('should not cleanup completed sessions', async () => {
      // Create and complete an upload
      const totalSize = MIN_CHUNK_SIZE
      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'completed-session.bin',
        totalSize,
      }))

      const chunkData = createTestData(totalSize)
      await resumeUpload({
        uploadUri: result.uploadUri,
        data: chunkData,
        offset: 0,
        totalSize,
        isFinal: true,
      })

      // Verify it's completed
      const stats1 = getUploadSessionStats()
      expect(stats1.completedSessions).toBe(1)

      // Fast forward past expiration
      vi.advanceTimersByTime(UPLOAD_SESSION_DURATION_MS + 1000)

      // Run cleanup
      const cleanupResult = cleanupStaleSessions()

      // Completed sessions should not be cleaned
      expect(cleanupResult.cleanedSessions).toBe(0)
    })

    it('should handle cleanup with no active sessions', () => {
      // Run cleanup with no sessions
      const cleanupResult = cleanupStaleSessions()

      expect(cleanupResult.cleanedSessions).toBe(0)
      expect(cleanupResult.freedMemory).toBe(0)
      expect(cleanupResult.cleanedUris).toEqual([])
    })

    it('should cleanup sessions with 0 bytes uploaded', async () => {
      // Disable auto cleanup so we can test manual cleanup
      updateStorageConfig({ enableAutoCleanup: false })

      // Create session but don't upload anything
      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'zero-bytes.bin',
      }))

      // Fast forward past expiration
      vi.advanceTimersByTime(UPLOAD_SESSION_DURATION_MS + 1000)

      // Run cleanup
      const cleanupResult = cleanupStaleSessions()

      // Session should be cleaned up
      expect(cleanupResult.cleanedSessions).toBe(1)
      expect(cleanupResult.freedMemory).toBe(0) // No memory was allocated
    })

    it('should cleanup partially uploaded sessions', async () => {
      // Disable auto cleanup so we can test manual cleanup
      updateStorageConfig({ enableAutoCleanup: false })

      // Create session with partial upload
      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'partial-upload.bin',
        totalSize: MIN_CHUNK_SIZE * 3,
      }))

      const chunkData = createTestData(MIN_CHUNK_SIZE)
      await resumeUpload({
        uploadUri: result.uploadUri,
        data: chunkData,
        offset: 0,
      })

      // Session has data but is not complete
      const memoryBefore = getResumableMemoryUsage()
      expect(memoryBefore).toBe(MIN_CHUNK_SIZE)

      // Fast forward past expiration
      vi.advanceTimersByTime(UPLOAD_SESSION_DURATION_MS + 1000)

      // Run cleanup
      const cleanupResult = cleanupStaleSessions()

      // Session should be cleaned up with memory released
      expect(cleanupResult.cleanedSessions).toBe(1)
      expect(cleanupResult.freedMemory).toBe(MIN_CHUNK_SIZE)
      expect(getResumableMemoryUsage()).toBe(0)
    })

    it('should cleanup both expired and idle sessions in same run', async () => {
      // Disable auto cleanup and configure short idle timeout
      const idleTimeout = 30 * 1000
      updateStorageConfig({ enableAutoCleanup: false, sessionIdleTimeoutMs: idleTimeout, cleanupIntervalMs: idleTimeout })

      // Create session 1 (will expire)
      const session1 = await initiateResumableUpload(defaultInitOptions({
        name: 'will-expire.bin',
      }))

      // Advance time to make session 1 expire
      vi.advanceTimersByTime(UPLOAD_SESSION_DURATION_MS + 1000)

      // Create session 2 at the new time (will be idle)
      const session2 = await initiateResumableUpload(defaultInitOptions({
        name: 'will-idle.bin',
      }))

      // Advance past idle timeout for session 2
      vi.advanceTimersByTime(idleTimeout + 1000)

      // Run cleanup
      const cleanupResult = cleanupStaleSessions()

      // Both sessions should be cleaned
      expect(cleanupResult.cleanedSessions).toBe(2)
      expect(cleanupResult.cleanedUris).toContain(session1.uploadUri)
      expect(cleanupResult.cleanedUris).toContain(session2.uploadUri)
    })
  })

  describe('Session Statistics', () => {
    it('should report correct statistics before and after cleanup', async () => {
      // Create mix of sessions
      const session1 = await initiateResumableUpload(defaultInitOptions({ name: 'stats1.bin' }))

      const totalSize = MIN_CHUNK_SIZE
      const session2 = await initiateResumableUpload(defaultInitOptions({
        name: 'stats2.bin',
        totalSize,
      }))
      const chunkData = createTestData(totalSize)
      await resumeUpload({
        uploadUri: session2.uploadUri,
        data: chunkData,
        offset: 0,
        totalSize,
        isFinal: true,
      })

      // Check stats before cleanup
      const statsBefore = getUploadSessionStats()
      expect(statsBefore.totalSessions).toBe(2)
      expect(statsBefore.activeSessions).toBe(1)
      expect(statsBefore.completedSessions).toBe(1)

      // Fast forward past expiration
      vi.advanceTimersByTime(UPLOAD_SESSION_DURATION_MS + 1000)

      // Cleanup should only remove active (non-completed) sessions
      cleanupStaleSessions()

      // Check stats after cleanup
      const statsAfter = getUploadSessionStats()
      expect(statsAfter.totalSessions).toBe(1) // Only completed remains
      expect(statsAfter.activeSessions).toBe(0)
      expect(statsAfter.completedSessions).toBe(1)
    })

    it('should track session age correctly', async () => {
      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'age-test.bin',
      }))

      // Advance time by 1 hour
      const oneHour = 60 * 60 * 1000
      vi.advanceTimersByTime(oneHour)

      const stats = getUploadSessionStats()
      const sessionDetail = stats.sessionDetails.find(s => s.uploadUri === result.uploadUri)

      expect(sessionDetail).toBeDefined()
      expect(sessionDetail!.ageMs).toBeGreaterThanOrEqual(oneHour)
      expect(sessionDetail!.idleMs).toBeGreaterThanOrEqual(oneHour)
    })

    it('should report expired status in session details', async () => {
      // Disable auto cleanup so the session isn't cleaned up before we check stats
      updateStorageConfig({ enableAutoCleanup: false })

      const result = await initiateResumableUpload(defaultInitOptions({
        name: 'expired-status.bin',
      }))

      // Fast forward past expiration
      vi.advanceTimersByTime(UPLOAD_SESSION_DURATION_MS + 1000)

      const stats = getUploadSessionStats()
      const sessionDetail = stats.sessionDetails.find(s => s.uploadUri === result.uploadUri)

      expect(sessionDetail).toBeDefined()
      expect(sessionDetail!.status).toBe('expired')
    })
  })

  describe('Cleanup with Memory Pressure', () => {
    it('should free enough memory to allow new uploads after cleanup', async () => {
      // Configure low memory limit and disable auto cleanup
      const maxMemory = MIN_CHUNK_SIZE * 2
      updateStorageConfig({
        enableAutoCleanup: false,
        maxResumableUploadMemoryBytes: maxMemory,
        sessionIdleTimeoutMs: 1000,
        cleanupIntervalMs: 1000,
      })

      // Fill up memory with uploads
      const session1 = await initiateResumableUpload(defaultInitOptions({ name: 'mem1.bin' }))
      await resumeUpload({
        uploadUri: session1.uploadUri,
        data: createTestData(MIN_CHUNK_SIZE),
        offset: 0,
      })

      const session2 = await initiateResumableUpload(defaultInitOptions({ name: 'mem2.bin' }))
      await resumeUpload({
        uploadUri: session2.uploadUri,
        data: createTestData(MIN_CHUNK_SIZE),
        offset: 0,
      })

      // Memory should be full
      expect(getResumableMemoryUsage()).toBe(maxMemory)

      // Advance past idle timeout and cleanup
      vi.advanceTimersByTime(2000)
      const cleanupResult = cleanupStaleSessions()

      // Memory should be freed
      expect(cleanupResult.freedMemory).toBe(maxMemory)
      expect(getResumableMemoryUsage()).toBe(0)

      // New upload should now be possible
      const newSession = await initiateResumableUpload(defaultInitOptions({ name: 'new.bin' }))
      await expect(resumeUpload({
        uploadUri: newSession.uploadUri,
        data: createTestData(MIN_CHUNK_SIZE),
        offset: 0,
      })).resolves.toBeDefined()
    })
  })
})
