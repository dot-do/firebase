/**
 * Tests for Configuration Isolation Between Test Runs
 *
 * Issue: firebase-zckf - TEST: Verify configuration isolation between test runs
 *
 * These tests verify that:
 * 1. FirebaseApp configurations are properly isolated between tests
 * 2. StorageConfig state is properly reset between tests
 * 3. Memory tracking state is properly reset between tests
 * 4. Environment variables don't leak between tests
 * 5. Generated secrets are properly reset between tests
 *
 * The tests are organized in multiple describe blocks that verify state
 * doesn't leak from one test to another.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  initializeApp,
  getApp,
  getApps,
  deleteApp,
  clearApps,
  type FirebaseApp,
} from '../../src/config/firebase-app.js'
import {
  updateStorageConfig,
  resetStorageConfig,
  getStorageConfig,
  allocateResumableMemory,
  getResumableMemoryUsage,
  resetMemoryTracking,
  getUrlSigningSecret,
  resetUrlSigningSecret,
} from '../../src/storage/config.js'

describe('Configuration Isolation Between Test Runs', () => {
  // ===========================================================================
  // Setup and Teardown
  // ===========================================================================

  beforeEach(() => {
    // Reset all state before each test
    clearApps()
    resetStorageConfig()
    resetMemoryTracking()
    resetUrlSigningSecret()
  })

  afterEach(() => {
    // Double-check cleanup after each test
    clearApps()
    resetStorageConfig()
    resetMemoryTracking()
    resetUrlSigningSecret()
  })

  // ===========================================================================
  // FirebaseApp Isolation Tests
  // ===========================================================================

  describe('FirebaseApp Isolation', () => {
    describe('First test batch - creates apps', () => {
      it('should start with no apps registered', () => {
        // Verify clean state at start
        expect(getApps()).toHaveLength(0)
      })

      it('should allow creating a default app', () => {
        const app = initializeApp({ projectId: 'isolation-test-1' })
        expect(app.name).toBe('[DEFAULT]')
        expect(getApps()).toHaveLength(1)
      })

      it('should allow creating named apps', () => {
        initializeApp({ projectId: 'isolation-test-2' }, 'app-a')
        initializeApp({ projectId: 'isolation-test-3' }, 'app-b')
        expect(getApps()).toHaveLength(2)
      })

      it('should not see apps from previous tests', () => {
        // This test runs after the previous ones - should start clean
        expect(getApps()).toHaveLength(0)
        expect(() => getApp()).toThrow()
        expect(() => getApp('app-a')).toThrow()
        expect(() => getApp('app-b')).toThrow()
      })
    })

    describe('Second test batch - verifies isolation', () => {
      it('should start with clean app registry', () => {
        // Even though previous describe block created apps,
        // this should start with a clean state
        expect(getApps()).toHaveLength(0)
      })

      it('should be able to reuse app names from previous tests', () => {
        // Names used in previous test batch should be available
        const appA = initializeApp({ projectId: 'new-project-a' }, 'app-a')
        const appB = initializeApp({ projectId: 'new-project-b' }, 'app-b')

        expect(appA.config.projectId).toBe('new-project-a')
        expect(appB.config.projectId).toBe('new-project-b')
      })

      it('should be able to create default app again', () => {
        const app = initializeApp({ projectId: 'another-default-project' })
        expect(app.name).toBe('[DEFAULT]')
        expect(app.config.projectId).toBe('another-default-project')
      })
    })

    describe('Third test batch - app configuration independence', () => {
      it('should maintain independent configurations per app instance', () => {
        const prodApp = initializeApp({
          projectId: 'prod-project',
          useEmulator: false,
        }, 'production')

        const devApp = initializeApp({
          projectId: 'dev-project',
          useEmulator: true,
        }, 'development')

        // Configurations should be independent
        expect(prodApp.isEmulatorMode()).toBe(false)
        expect(devApp.isEmulatorMode()).toBe(true)

        // Modifying one shouldn't affect the other
        expect(prodApp.config.projectId).not.toBe(devApp.config.projectId)
      })

      it('should properly delete individual apps without affecting others', () => {
        const app1 = initializeApp({ projectId: 'project-1' }, 'app1')
        const app2 = initializeApp({ projectId: 'project-2' }, 'app2')
        const app3 = initializeApp({ projectId: 'project-3' }, 'app3')

        expect(getApps()).toHaveLength(3)

        // Delete middle app
        deleteApp(app2)

        expect(getApps()).toHaveLength(2)
        expect(() => getApp('app2')).toThrow()
        expect(getApp('app1')).toBe(app1)
        expect(getApp('app3')).toBe(app3)
      })
    })
  })

  // ===========================================================================
  // StorageConfig Isolation Tests
  // ===========================================================================

  describe('StorageConfig Isolation', () => {
    describe('First test batch - modifies config', () => {
      it('should start with default config values', () => {
        const config = getStorageConfig()
        expect(config.maxUploadSizeBytes).toBe(100 * 1024 * 1024)
        expect(config.securityMode).toBe('open')
        expect(config.enableAutoCleanup).toBe(true)
      })

      it('should allow updating config values', () => {
        updateStorageConfig({
          maxUploadSizeBytes: 50 * 1024 * 1024,
          securityMode: 'authenticated',
          enableAutoCleanup: false,
        })

        const config = getStorageConfig()
        expect(config.maxUploadSizeBytes).toBe(50 * 1024 * 1024)
        expect(config.securityMode).toBe('authenticated')
        expect(config.enableAutoCleanup).toBe(false)
      })

      it('should not see config changes from previous test', () => {
        // Previous test modified config, but this test should see defaults
        const config = getStorageConfig()
        expect(config.maxUploadSizeBytes).toBe(100 * 1024 * 1024)
        expect(config.securityMode).toBe('open')
        expect(config.enableAutoCleanup).toBe(true)
      })
    })

    describe('Second test batch - verifies isolation', () => {
      it('should have clean default config', () => {
        const config = getStorageConfig()

        // All default values should be present
        expect(config.maxUploadSizeBytes).toBe(100 * 1024 * 1024)
        expect(config.maxResumableUploadSizeBytes).toBe(5 * 1024 * 1024 * 1024 * 1024)
        expect(config.maxResumableUploadMemoryBytes).toBe(500 * 1024 * 1024)
        expect(config.cleanupIntervalMs).toBe(5 * 60 * 1000)
        expect(config.sessionIdleTimeoutMs).toBe(60 * 60 * 1000)
        expect(config.maxConcurrentResumableSessions).toBe(1000)
        expect(config.incrementalProcessingThresholdBytes).toBe(1024 * 1024)
        expect(config.securityMode).toBe('open')
        expect(config.enableAutoCleanup).toBe(true)
      })

      it('should allow setting project-specific config', () => {
        updateStorageConfig({
          projectId: 'isolated-project',
          securityMode: 'rules',
        })

        const config = getStorageConfig()
        expect(config.projectId).toBe('isolated-project')
        expect(config.securityMode).toBe('rules')
      })

      it('should maintain updated values within the same test', () => {
        updateStorageConfig({ maxUploadSizeBytes: 25 * 1024 * 1024 })
        expect(getStorageConfig().maxUploadSizeBytes).toBe(25 * 1024 * 1024)

        updateStorageConfig({ maxUploadSizeBytes: 75 * 1024 * 1024 })
        expect(getStorageConfig().maxUploadSizeBytes).toBe(75 * 1024 * 1024)
      })
    })

    describe('Third test batch - validates reset behavior', () => {
      it('should reset to defaults when resetStorageConfig is called', () => {
        // Modify several values
        updateStorageConfig({
          maxUploadSizeBytes: 10 * 1024 * 1024,
          securityMode: 'authenticated',
          enableAutoCleanup: false,
          projectId: 'test-project',
        })

        // Reset
        resetStorageConfig()

        // Verify defaults
        const config = getStorageConfig()
        expect(config.maxUploadSizeBytes).toBe(100 * 1024 * 1024)
        expect(config.securityMode).toBe('open')
        expect(config.enableAutoCleanup).toBe(true)
        expect(config.projectId).toBeUndefined()
      })
    })
  })

  // ===========================================================================
  // Memory Tracking Isolation Tests
  // ===========================================================================

  describe('Memory Tracking Isolation', () => {
    describe('First test batch - allocates memory', () => {
      it('should start with zero memory usage', () => {
        expect(getResumableMemoryUsage()).toBe(0)
      })

      it('should track memory allocation', () => {
        const allocated = allocateResumableMemory(10 * 1024 * 1024)
        expect(allocated).toBe(true)
        expect(getResumableMemoryUsage()).toBe(10 * 1024 * 1024)
      })

      it('should not see memory from previous test', () => {
        // Previous test allocated memory, but this should start clean
        expect(getResumableMemoryUsage()).toBe(0)
      })
    })

    describe('Second test batch - verifies memory isolation', () => {
      it('should start with zero memory usage in new describe block', () => {
        expect(getResumableMemoryUsage()).toBe(0)
      })

      it('should track cumulative allocations within single test', () => {
        allocateResumableMemory(5 * 1024 * 1024)
        allocateResumableMemory(5 * 1024 * 1024)
        allocateResumableMemory(5 * 1024 * 1024)

        expect(getResumableMemoryUsage()).toBe(15 * 1024 * 1024)
      })

      it('should respect memory limits', () => {
        // Set a small limit
        updateStorageConfig({ maxResumableUploadMemoryBytes: 20 * 1024 * 1024 })

        // Allocate within limit
        expect(allocateResumableMemory(15 * 1024 * 1024)).toBe(true)

        // This would exceed limit
        expect(allocateResumableMemory(10 * 1024 * 1024)).toBe(false)

        // Current usage unchanged on failed allocation
        expect(getResumableMemoryUsage()).toBe(15 * 1024 * 1024)
      })
    })

    describe('Third test batch - verifies reset behavior', () => {
      it('should have clean memory state after previous test batch', () => {
        expect(getResumableMemoryUsage()).toBe(0)
      })

      it('should properly reset memory tracking', () => {
        allocateResumableMemory(50 * 1024 * 1024)
        expect(getResumableMemoryUsage()).toBe(50 * 1024 * 1024)

        resetMemoryTracking()
        expect(getResumableMemoryUsage()).toBe(0)
      })
    })
  })

  // ===========================================================================
  // URL Signing Secret Isolation Tests
  // ===========================================================================

  describe('URL Signing Secret Isolation', () => {
    describe('First test batch - generates secret', () => {
      let firstSecret: string

      it('should generate a secret when not configured', () => {
        firstSecret = getUrlSigningSecret()
        expect(firstSecret).toBeDefined()
        expect(firstSecret.length).toBe(64) // 32 bytes = 64 hex chars
      })

      it('should return same secret within same test run', () => {
        const secret1 = getUrlSigningSecret()
        const secret2 = getUrlSigningSecret()
        expect(secret1).toBe(secret2)
      })

      it('should generate new secret after reset', () => {
        const originalSecret = getUrlSigningSecret()
        resetUrlSigningSecret()
        const newSecret = getUrlSigningSecret()

        expect(newSecret).not.toBe(originalSecret)
        expect(newSecret.length).toBe(64)
      })
    })

    describe('Second test batch - verifies secret isolation', () => {
      it('should generate a fresh secret (not from previous tests)', () => {
        // This is a new secret, different from previous test batch
        const secret = getUrlSigningSecret()
        expect(secret).toBeDefined()
        expect(secret.length).toBe(64)
      })

      it('should use configured secret when provided', () => {
        const customSecret = 'my-custom-signing-secret-1234567890'
        updateStorageConfig({ urlSigningSecret: customSecret })

        expect(getUrlSigningSecret()).toBe(customSecret)
      })

      it('should fall back to generated secret when config secret is reset', () => {
        const customSecret = 'my-custom-signing-secret-1234567890'
        updateStorageConfig({ urlSigningSecret: customSecret })
        expect(getUrlSigningSecret()).toBe(customSecret)

        // Reset config (removes custom secret)
        resetStorageConfig()

        // Should now return a generated secret
        const generatedSecret = getUrlSigningSecret()
        expect(generatedSecret).not.toBe(customSecret)
        expect(generatedSecret.length).toBe(64)
      })
    })
  })

  // ===========================================================================
  // Environment Variable Isolation Tests
  // ===========================================================================

  describe('Environment Variable Isolation', () => {
    const originalEnv: Record<string, string | undefined> = {}

    beforeEach(() => {
      // Save original env values
      originalEnv['TEST_CONFIG_ISOLATION_VAR'] = process.env.TEST_CONFIG_ISOLATION_VAR
    })

    afterEach(() => {
      // Restore original env values
      if (originalEnv['TEST_CONFIG_ISOLATION_VAR'] === undefined) {
        delete process.env.TEST_CONFIG_ISOLATION_VAR
      } else {
        process.env.TEST_CONFIG_ISOLATION_VAR = originalEnv['TEST_CONFIG_ISOLATION_VAR']
      }
    })

    describe('First test batch - sets env vars', () => {
      it('should not have test env var initially', () => {
        expect(process.env.TEST_CONFIG_ISOLATION_VAR).toBeUndefined()
      })

      it('should be able to set env var', () => {
        process.env.TEST_CONFIG_ISOLATION_VAR = 'first-value'
        expect(process.env.TEST_CONFIG_ISOLATION_VAR).toBe('first-value')
      })

      it('should not see env var from previous test', () => {
        // Previous test set the var, but afterEach should have cleaned it
        expect(process.env.TEST_CONFIG_ISOLATION_VAR).toBeUndefined()
      })
    })

    describe('Second test batch - verifies env var isolation', () => {
      it('should start with clean env', () => {
        expect(process.env.TEST_CONFIG_ISOLATION_VAR).toBeUndefined()
      })

      it('should be able to set new value', () => {
        process.env.TEST_CONFIG_ISOLATION_VAR = 'second-value'
        expect(process.env.TEST_CONFIG_ISOLATION_VAR).toBe('second-value')
      })
    })
  })

  // ===========================================================================
  // Cross-Module Isolation Tests
  // ===========================================================================

  describe('Cross-Module Isolation', () => {
    it('should not have cross-contamination between FirebaseApp and StorageConfig', () => {
      // Initialize a Firebase app
      const app = initializeApp({ projectId: 'cross-module-test' })

      // Update storage config with different project ID
      updateStorageConfig({ projectId: 'storage-only-project' })

      // They should remain independent
      expect(app.config.projectId).toBe('cross-module-test')
      expect(getStorageConfig().projectId).toBe('storage-only-project')
    })

    it('should maintain independence after partial reset', () => {
      // Set up both
      initializeApp({ projectId: 'app-project' })
      updateStorageConfig({ projectId: 'storage-project' })

      // Reset only storage
      resetStorageConfig()

      // App should still exist, storage should be reset
      expect(getApps()).toHaveLength(1)
      expect(getApp().config.projectId).toBe('app-project')
      expect(getStorageConfig().projectId).toBeUndefined()
    })

    it('should maintain independence after partial app clear', () => {
      // Set up both
      initializeApp({ projectId: 'app-project' })
      updateStorageConfig({ projectId: 'storage-project' })

      // Clear only apps
      clearApps()

      // Storage should still have its config, app should be gone
      expect(getApps()).toHaveLength(0)
      expect(getStorageConfig().projectId).toBe('storage-project')
    })
  })

  // ===========================================================================
  // Concurrent Initialization Tests
  // ===========================================================================

  describe('Concurrent Initialization Safety', () => {
    it('should handle multiple apps with different endpoint configurations', () => {
      const prodApp = initializeApp({
        projectId: 'prod-project',
        endpoints: {
          auth: { url: 'https://auth.production.com' },
        },
      }, 'production')

      const stagingApp = initializeApp({
        projectId: 'staging-project',
        endpoints: {
          auth: { url: 'https://auth.staging.com' },
        },
      }, 'staging')

      const devApp = initializeApp({
        projectId: 'dev-project',
        useEmulator: true,
      }, 'development')

      // Each should have independent endpoint configuration
      expect(prodApp.endpoints.auth.url).toBe('https://auth.production.com')
      expect(stagingApp.endpoints.auth.url).toBe('https://auth.staging.com')
      expect(devApp.endpoints.auth.url).toContain('localhost')

      // All three should be independently retrievable
      expect(getApp('production')).toBe(prodApp)
      expect(getApp('staging')).toBe(stagingApp)
      expect(getApp('development')).toBe(devApp)
    })

    it('should properly isolate frozen configs', () => {
      const app = initializeApp({
        projectId: 'frozen-test',
        apiKey: 'original-key',
      })

      // Config should be frozen
      expect(Object.isFrozen(app.config)).toBe(true)
      expect(Object.isFrozen(app.endpoints)).toBe(true)

      // Attempting to modify should fail silently (strict mode) or throw
      expect(() => {
        (app.config as any).projectId = 'modified'
      }).toThrow()

      // Original value should be preserved
      expect(app.config.projectId).toBe('frozen-test')
    })
  })

  // ===========================================================================
  // State Verification After All Tests
  // ===========================================================================

  describe('Final State Verification', () => {
    it('should have clean state for any new tests', () => {
      // This test runs last and verifies complete cleanup
      expect(getApps()).toHaveLength(0)
      expect(getStorageConfig().projectId).toBeUndefined()
      expect(getStorageConfig().securityMode).toBe('open')
      expect(getResumableMemoryUsage()).toBe(0)
    })
  })
})
