/**
 * Tests for configuration validation - Invalid values
 *
 * Issue: firebase-yia0 - TEST: Verify configuration validation catches invalid values
 *
 * These are RED tests that verify configuration validation catches:
 * - Negative limits
 * - Invalid URLs
 * - Wrong types
 * - Out-of-range values
 *
 * These tests are expected to FAIL initially (RED phase) until validation
 * logic is implemented in the configuration modules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  initializeApp,
  clearApps,
  type FirebaseAppConfig,
} from '../../src/config/firebase-app.js'
import {
  updateStorageConfig,
  resetStorageConfig,
  getStorageConfig,
  type StorageConfig,
} from '../../src/storage/config.js'

describe('Configuration Validation - Invalid Values', () => {
  beforeEach(() => {
    clearApps()
    resetStorageConfig()
  })

  afterEach(() => {
    clearApps()
    resetStorageConfig()
  })

  // ===========================================================================
  // FirebaseAppConfig Validation
  // ===========================================================================

  describe('FirebaseAppConfig - Invalid Values', () => {
    describe('projectId validation', () => {
      it('should reject empty string projectId', () => {
        expect(() => initializeApp({ projectId: '' })).toThrow()
      })

      it('should reject projectId with spaces', () => {
        expect(() => initializeApp({ projectId: 'my project' })).toThrow()
      })

      it('should reject projectId with special characters', () => {
        expect(() => initializeApp({ projectId: 'my@project!' })).toThrow()
      })

      it('should reject projectId with underscores', () => {
        expect(() => initializeApp({ projectId: 'my_project' })).toThrow()
      })

      it('should reject projectId with uppercase letters', () => {
        expect(() => initializeApp({ projectId: 'MyProject' })).toThrow()
      })

      it('should reject projectId that is too long (>30 chars)', () => {
        const longProjectId = 'a'.repeat(31)
        expect(() => initializeApp({ projectId: longProjectId })).toThrow()
      })

      it('should reject null projectId', () => {
        // @ts-expect-error - Testing runtime validation with invalid type
        expect(() => initializeApp({ projectId: null })).toThrow()
      })

      it('should reject undefined projectId', () => {
        // @ts-expect-error - Testing runtime validation with invalid type
        expect(() => initializeApp({ projectId: undefined })).toThrow()
      })

      it('should reject numeric projectId', () => {
        // @ts-expect-error - Testing runtime validation with wrong type
        expect(() => initializeApp({ projectId: 12345 })).toThrow()
      })
    })

    describe('endpoint URL validation', () => {
      it('should reject endpoint with empty URL', () => {
        expect(() =>
          initializeApp({
            projectId: 'test-project',
            endpoints: {
              auth: { url: '' },
            },
          })
        ).toThrow()
      })

      it('should reject endpoint with malformed URL (no protocol)', () => {
        expect(() =>
          initializeApp({
            projectId: 'test-project',
            endpoints: {
              auth: { url: 'auth.firebase.do' },
            },
          })
        ).toThrow()
      })

      it('should reject endpoint with invalid protocol', () => {
        expect(() =>
          initializeApp({
            projectId: 'test-project',
            endpoints: {
              auth: { url: 'ftp://auth.firebase.do' },
            },
          })
        ).toThrow()
      })

      it('should reject endpoint with javascript: protocol', () => {
        expect(() =>
          initializeApp({
            projectId: 'test-project',
            endpoints: {
              auth: { url: 'javascript:alert(1)' },
            },
          })
        ).toThrow()
      })

      it('should reject endpoint URL with spaces', () => {
        expect(() =>
          initializeApp({
            projectId: 'test-project',
            endpoints: {
              auth: { url: 'https://auth .firebase.do' },
            },
          })
        ).toThrow()
      })

      it('should reject endpoint with numeric URL', () => {
        expect(() =>
          initializeApp({
            projectId: 'test-project',
            endpoints: {
              // @ts-expect-error - Testing runtime validation with wrong type
              auth: { url: 12345 },
            },
          })
        ).toThrow()
      })

      it('should reject endpoint with null URL', () => {
        expect(() =>
          initializeApp({
            projectId: 'test-project',
            endpoints: {
              // @ts-expect-error - Testing runtime validation with wrong type
              auth: { url: null },
            },
          })
        ).toThrow()
      })
    })

    describe('emulatorHost validation', () => {
      it('should reject emulatorHost with protocol prefix', () => {
        expect(() =>
          initializeApp({
            projectId: 'test-project',
            useEmulator: true,
            emulatorHost: 'http://localhost',
          })
        ).toThrow()
      })

      it('should reject emulatorHost with port', () => {
        expect(() =>
          initializeApp({
            projectId: 'test-project',
            useEmulator: true,
            emulatorHost: 'localhost:8080',
          })
        ).toThrow()
      })

      it('should reject empty emulatorHost', () => {
        expect(() =>
          initializeApp({
            projectId: 'test-project',
            useEmulator: true,
            emulatorHost: '',
          })
        ).toThrow()
      })
    })
  })

  // ===========================================================================
  // StorageConfig Validation - Negative Limits
  // ===========================================================================

  describe('StorageConfig - Negative Limits', () => {
    it('should reject negative maxUploadSizeBytes', () => {
      expect(() =>
        updateStorageConfig({ maxUploadSizeBytes: -1 })
      ).toThrow()
    })

    it('should reject negative maxResumableUploadSizeBytes', () => {
      expect(() =>
        updateStorageConfig({ maxResumableUploadSizeBytes: -100 })
      ).toThrow()
    })

    it('should reject negative maxResumableUploadMemoryBytes', () => {
      expect(() =>
        updateStorageConfig({ maxResumableUploadMemoryBytes: -1024 })
      ).toThrow()
    })

    it('should reject negative cleanupIntervalMs', () => {
      expect(() =>
        updateStorageConfig({ cleanupIntervalMs: -5000 })
      ).toThrow()
    })

    it('should reject negative sessionIdleTimeoutMs', () => {
      expect(() =>
        updateStorageConfig({ sessionIdleTimeoutMs: -60000 })
      ).toThrow()
    })

    it('should reject negative maxConcurrentResumableSessions', () => {
      expect(() =>
        updateStorageConfig({ maxConcurrentResumableSessions: -10 })
      ).toThrow()
    })

    it('should reject negative incrementalProcessingThresholdBytes', () => {
      expect(() =>
        updateStorageConfig({ incrementalProcessingThresholdBytes: -1 })
      ).toThrow()
    })
  })

  // ===========================================================================
  // StorageConfig Validation - Zero Values
  // ===========================================================================

  describe('StorageConfig - Zero Values', () => {
    it('should reject zero maxUploadSizeBytes', () => {
      expect(() =>
        updateStorageConfig({ maxUploadSizeBytes: 0 })
      ).toThrow()
    })

    it('should reject zero maxResumableUploadSizeBytes', () => {
      expect(() =>
        updateStorageConfig({ maxResumableUploadSizeBytes: 0 })
      ).toThrow()
    })

    it('should reject zero maxResumableUploadMemoryBytes', () => {
      expect(() =>
        updateStorageConfig({ maxResumableUploadMemoryBytes: 0 })
      ).toThrow()
    })

    it('should reject zero cleanupIntervalMs', () => {
      expect(() =>
        updateStorageConfig({ cleanupIntervalMs: 0 })
      ).toThrow()
    })

    it('should reject zero sessionIdleTimeoutMs', () => {
      expect(() =>
        updateStorageConfig({ sessionIdleTimeoutMs: 0 })
      ).toThrow()
    })

    it('should reject zero maxConcurrentResumableSessions', () => {
      expect(() =>
        updateStorageConfig({ maxConcurrentResumableSessions: 0 })
      ).toThrow()
    })
  })

  // ===========================================================================
  // StorageConfig Validation - Wrong Types
  // ===========================================================================

  describe('StorageConfig - Wrong Types', () => {
    it('should reject string for maxUploadSizeBytes', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with wrong type
        updateStorageConfig({ maxUploadSizeBytes: '100MB' })
      ).toThrow()
    })

    it('should reject string for cleanupIntervalMs', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with wrong type
        updateStorageConfig({ cleanupIntervalMs: '5 minutes' })
      ).toThrow()
    })

    it('should reject object for maxConcurrentResumableSessions', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with wrong type
        updateStorageConfig({ maxConcurrentResumableSessions: { max: 100 } })
      ).toThrow()
    })

    it('should reject array for sessionIdleTimeoutMs', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with wrong type
        updateStorageConfig({ sessionIdleTimeoutMs: [60000] })
      ).toThrow()
    })

    it('should reject boolean for maxResumableUploadSizeBytes', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with wrong type
        updateStorageConfig({ maxResumableUploadSizeBytes: true })
      ).toThrow()
    })

    it('should reject null for maxUploadSizeBytes', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with wrong type
        updateStorageConfig({ maxUploadSizeBytes: null })
      ).toThrow()
    })

    it('should reject NaN for numeric config values', () => {
      expect(() =>
        updateStorageConfig({ maxUploadSizeBytes: NaN })
      ).toThrow()
    })

    it('should reject Infinity for numeric config values', () => {
      expect(() =>
        updateStorageConfig({ maxUploadSizeBytes: Infinity })
      ).toThrow()
    })

    it('should reject -Infinity for numeric config values', () => {
      expect(() =>
        updateStorageConfig({ maxUploadSizeBytes: -Infinity })
      ).toThrow()
    })
  })

  // ===========================================================================
  // StorageConfig Validation - Invalid securityMode
  // ===========================================================================

  describe('StorageConfig - Invalid securityMode', () => {
    it('should reject invalid securityMode string', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with invalid value
        updateStorageConfig({ securityMode: 'invalid-mode' })
      ).toThrow()
    })

    it('should reject numeric securityMode', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with wrong type
        updateStorageConfig({ securityMode: 1 })
      ).toThrow()
    })

    it('should reject empty string securityMode', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with invalid value
        updateStorageConfig({ securityMode: '' })
      ).toThrow()
    })

    it('should reject null securityMode', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with wrong type
        updateStorageConfig({ securityMode: null })
      ).toThrow()
    })
  })

  // ===========================================================================
  // StorageConfig Validation - Invalid projectId
  // ===========================================================================

  describe('StorageConfig - Invalid projectId', () => {
    it('should reject empty string projectId', () => {
      expect(() =>
        updateStorageConfig({ projectId: '' })
      ).toThrow()
    })

    it('should reject projectId with spaces', () => {
      expect(() =>
        updateStorageConfig({ projectId: 'my project' })
      ).toThrow()
    })

    it('should reject projectId with special characters', () => {
      expect(() =>
        updateStorageConfig({ projectId: 'my@project!' })
      ).toThrow()
    })

    it('should reject numeric projectId', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with wrong type
        updateStorageConfig({ projectId: 12345 })
      ).toThrow()
    })
  })

  // ===========================================================================
  // StorageConfig Validation - Invalid urlSigningSecret
  // ===========================================================================

  describe('StorageConfig - Invalid urlSigningSecret', () => {
    it('should reject urlSigningSecret that is too short', () => {
      expect(() =>
        updateStorageConfig({ urlSigningSecret: 'abc' })
      ).toThrow()
    })

    it('should reject empty urlSigningSecret', () => {
      expect(() =>
        updateStorageConfig({ urlSigningSecret: '' })
      ).toThrow()
    })

    it('should reject numeric urlSigningSecret', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with wrong type
        updateStorageConfig({ urlSigningSecret: 12345 })
      ).toThrow()
    })
  })

  // ===========================================================================
  // StorageConfig Validation - Logical Constraints
  // ===========================================================================

  describe('StorageConfig - Logical Constraints', () => {
    it('should reject maxUploadSizeBytes greater than maxResumableUploadSizeBytes', () => {
      // Simple uploads shouldn't be larger than resumable upload max
      expect(() =>
        updateStorageConfig({
          maxUploadSizeBytes: 10 * 1024 * 1024 * 1024, // 10GB
          maxResumableUploadSizeBytes: 1 * 1024 * 1024 * 1024, // 1GB
        })
      ).toThrow()
    })

    it('should reject cleanupIntervalMs greater than sessionIdleTimeoutMs', () => {
      // Cleanup interval should be shorter than session timeout
      expect(() =>
        updateStorageConfig({
          cleanupIntervalMs: 2 * 60 * 60 * 1000, // 2 hours
          sessionIdleTimeoutMs: 30 * 60 * 1000, // 30 minutes
        })
      ).toThrow()
    })

    it('should reject incrementalProcessingThresholdBytes greater than maxUploadSizeBytes', () => {
      expect(() =>
        updateStorageConfig({
          incrementalProcessingThresholdBytes: 200 * 1024 * 1024, // 200MB
          maxUploadSizeBytes: 100 * 1024 * 1024, // 100MB
        })
      ).toThrow()
    })
  })

  // ===========================================================================
  // StorageConfig Validation - Float/Decimal Values
  // ===========================================================================

  describe('StorageConfig - Float/Decimal Values', () => {
    it('should reject float for maxUploadSizeBytes', () => {
      expect(() =>
        updateStorageConfig({ maxUploadSizeBytes: 100.5 })
      ).toThrow()
    })

    it('should reject float for maxConcurrentResumableSessions', () => {
      expect(() =>
        updateStorageConfig({ maxConcurrentResumableSessions: 10.5 })
      ).toThrow()
    })

    it('should reject float for cleanupIntervalMs', () => {
      expect(() =>
        updateStorageConfig({ cleanupIntervalMs: 5000.5 })
      ).toThrow()
    })
  })

  // ===========================================================================
  // StorageConfig Validation - enableAutoCleanup wrong type
  // ===========================================================================

  describe('StorageConfig - enableAutoCleanup wrong type', () => {
    it('should reject string for enableAutoCleanup', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with wrong type
        updateStorageConfig({ enableAutoCleanup: 'true' })
      ).toThrow()
    })

    it('should reject number for enableAutoCleanup', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with wrong type
        updateStorageConfig({ enableAutoCleanup: 1 })
      ).toThrow()
    })

    it('should reject null for enableAutoCleanup', () => {
      expect(() =>
        // @ts-expect-error - Testing runtime validation with wrong type
        updateStorageConfig({ enableAutoCleanup: null })
      ).toThrow()
    })
  })

  // ===========================================================================
  // StorageConfig - Validate config values are applied correctly
  // ===========================================================================

  describe('StorageConfig - Valid Values Should Work', () => {
    it('should accept valid positive integer for maxUploadSizeBytes', () => {
      updateStorageConfig({ maxUploadSizeBytes: 50 * 1024 * 1024 })
      const config = getStorageConfig()
      expect(config.maxUploadSizeBytes).toBe(50 * 1024 * 1024)
    })

    it('should accept valid securityMode values', () => {
      updateStorageConfig({ securityMode: 'authenticated' })
      expect(getStorageConfig().securityMode).toBe('authenticated')

      updateStorageConfig({ securityMode: 'rules' })
      expect(getStorageConfig().securityMode).toBe('rules')

      updateStorageConfig({ securityMode: 'open' })
      expect(getStorageConfig().securityMode).toBe('open')
    })

    it('should accept valid boolean for enableAutoCleanup', () => {
      updateStorageConfig({ enableAutoCleanup: false })
      expect(getStorageConfig().enableAutoCleanup).toBe(false)

      updateStorageConfig({ enableAutoCleanup: true })
      expect(getStorageConfig().enableAutoCleanup).toBe(true)
    })
  })
})
