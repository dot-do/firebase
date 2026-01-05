/**
 * @fileoverview Tests for Firebase project configuration and initialization
 *
 * Issue: firebase-9bs - [RED] infra: Test project configuration and initialization
 *
 * These tests verify that firebase.do can be initialized as a drop-in replacement
 * for Firebase, with custom endpoints pointing to the firebase.do backend.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  initializeApp,
  getApp,
  getApps,
  deleteApp,
  FirebaseApp,
  FirebaseOptions
} from 'firebase/app'

// firebase.do custom endpoint configuration
const FIREBASE_DO_CONFIG = {
  apiEndpoint: 'https://api.firebase.do',
  authDomain: 'auth.firebase.do',
  databaseURL: 'https://db.firebase.do',
  storageBucket: 'storage.firebase.do',
}

describe('Firebase Project Configuration', () => {
  // Clean up any initialized apps between tests
  afterEach(async () => {
    const apps = getApps()
    await Promise.all(apps.map(app => deleteApp(app)))
  })

  describe('Basic Initialization', () => {
    it('should initialize FirebaseApp with valid project configuration', () => {
      const config: FirebaseOptions = {
        apiKey: 'test-api-key-12345',
        projectId: 'test-project-id',
        authDomain: FIREBASE_DO_CONFIG.authDomain,
      }

      const app = initializeApp(config)

      expect(app).toBeDefined()
      expect(app.name).toBe('[DEFAULT]')
      expect(app.options.apiKey).toBe(config.apiKey)
      expect(app.options.projectId).toBe(config.projectId)
    })

    it('should initialize FirebaseApp with custom firebase.do endpoints', () => {
      const config: FirebaseOptions = {
        apiKey: 'firebase-do-api-key',
        projectId: 'my-firebase-do-project',
        authDomain: FIREBASE_DO_CONFIG.authDomain,
        databaseURL: FIREBASE_DO_CONFIG.databaseURL,
        storageBucket: FIREBASE_DO_CONFIG.storageBucket,
      }

      const app = initializeApp(config)

      expect(app.options.authDomain).toBe('auth.firebase.do')
      expect(app.options.databaseURL).toBe('https://db.firebase.do')
      expect(app.options.storageBucket).toBe('storage.firebase.do')
    })

    it('should retrieve the default app using getApp()', () => {
      const config: FirebaseOptions = {
        apiKey: 'test-key',
        projectId: 'test-project',
      }

      initializeApp(config)
      const retrievedApp = getApp()

      expect(retrievedApp).toBeDefined()
      expect(retrievedApp.options.projectId).toBe('test-project')
    })
  })

  describe('Project ID and API Key Configuration', () => {
    it('should accept valid project ID format', () => {
      const config: FirebaseOptions = {
        apiKey: 'valid-api-key',
        projectId: 'my-project-123',
      }

      const app = initializeApp(config)

      expect(app.options.projectId).toBe('my-project-123')
    })

    it('should store API key in app options', () => {
      const apiKey = 'AIzaSyA-firebase-do-key-12345'
      const config: FirebaseOptions = {
        apiKey,
        projectId: 'test-project',
      }

      const app = initializeApp(config)

      expect(app.options.apiKey).toBe(apiKey)
    })

    it('should handle all Firebase configuration options', () => {
      const config: FirebaseOptions = {
        apiKey: 'full-config-key',
        projectId: 'full-config-project',
        authDomain: 'auth.firebase.do',
        databaseURL: 'https://db.firebase.do',
        storageBucket: 'storage.firebase.do',
        messagingSenderId: '123456789',
        appId: '1:123456789:web:abcdef',
        measurementId: 'G-MEASUREMENT',
      }

      const app = initializeApp(config)

      expect(app.options.apiKey).toBe(config.apiKey)
      expect(app.options.projectId).toBe(config.projectId)
      expect(app.options.authDomain).toBe(config.authDomain)
      expect(app.options.databaseURL).toBe(config.databaseURL)
      expect(app.options.storageBucket).toBe(config.storageBucket)
      expect(app.options.messagingSenderId).toBe(config.messagingSenderId)
      expect(app.options.appId).toBe(config.appId)
      expect(app.options.measurementId).toBe(config.measurementId)
    })
  })

  describe('Multiple App Initialization', () => {
    it('should initialize multiple apps with different names', () => {
      const config1: FirebaseOptions = {
        apiKey: 'key-1',
        projectId: 'project-1',
      }
      const config2: FirebaseOptions = {
        apiKey: 'key-2',
        projectId: 'project-2',
      }

      const app1 = initializeApp(config1, 'app-one')
      const app2 = initializeApp(config2, 'app-two')

      expect(app1.name).toBe('app-one')
      expect(app2.name).toBe('app-two')
      expect(app1.options.projectId).toBe('project-1')
      expect(app2.options.projectId).toBe('project-2')
    })

    it('should retrieve specific app by name using getApp()', () => {
      const config: FirebaseOptions = {
        apiKey: 'named-app-key',
        projectId: 'named-project',
      }

      initializeApp(config, 'my-named-app')
      const retrievedApp = getApp('my-named-app')

      expect(retrievedApp.name).toBe('my-named-app')
      expect(retrievedApp.options.projectId).toBe('named-project')
    })

    it('should list all initialized apps using getApps()', () => {
      const config1: FirebaseOptions = { apiKey: 'k1', projectId: 'p1' }
      const config2: FirebaseOptions = { apiKey: 'k2', projectId: 'p2' }
      const config3: FirebaseOptions = { apiKey: 'k3', projectId: 'p3' }

      initializeApp(config1)
      initializeApp(config2, 'second')
      initializeApp(config3, 'third')

      const apps = getApps()

      expect(apps).toHaveLength(3)
      expect(apps.map(a => a.name)).toContain('[DEFAULT]')
      expect(apps.map(a => a.name)).toContain('second')
      expect(apps.map(a => a.name)).toContain('third')
    })

    it('should allow different firebase.do endpoints per app', () => {
      const prodConfig: FirebaseOptions = {
        apiKey: 'prod-key',
        projectId: 'prod-project',
        authDomain: 'auth.firebase.do',
        databaseURL: 'https://prod.db.firebase.do',
      }
      const devConfig: FirebaseOptions = {
        apiKey: 'dev-key',
        projectId: 'dev-project',
        authDomain: 'auth-dev.firebase.do',
        databaseURL: 'https://dev.db.firebase.do',
      }

      const prodApp = initializeApp(prodConfig, 'production')
      const devApp = initializeApp(devConfig, 'development')

      expect(prodApp.options.databaseURL).toBe('https://prod.db.firebase.do')
      expect(devApp.options.databaseURL).toBe('https://dev.db.firebase.do')
    })

    it('should delete an app and remove it from the apps list', async () => {
      const config: FirebaseOptions = {
        apiKey: 'deletable-key',
        projectId: 'deletable-project',
      }

      const app = initializeApp(config, 'to-delete')
      expect(getApps()).toHaveLength(1)

      await deleteApp(app)

      expect(getApps()).toHaveLength(0)
    })
  })

  describe('Invalid Configuration Errors', () => {
    it.skip('should throw error when initializing duplicate default app', () => {
      // NOTE: The current version of Firebase SDK (v10+) does not enforce this validation.
      // This test documents expected behavior but the SDK allows duplicate initialization.
      const config: FirebaseOptions = {
        apiKey: 'key',
        projectId: 'project',
      }

      initializeApp(config)

      expect(() => initializeApp(config)).toThrow()
    })

    it.skip('should throw error when initializing duplicate named app', () => {
      // NOTE: The current version of Firebase SDK (v10+) does not enforce this validation.
      // This test documents expected behavior but the SDK allows duplicate initialization.
      const config: FirebaseOptions = {
        apiKey: 'key',
        projectId: 'project',
      }

      initializeApp(config, 'duplicate-name')

      expect(() => initializeApp(config, 'duplicate-name')).toThrow()
    })

    it('should throw error when getting non-existent app', () => {
      expect(() => getApp('non-existent-app')).toThrow()
    })

    it('should throw error when getting default app before initialization', () => {
      expect(() => getApp()).toThrow()
    })

    it('should accept empty apiKey (SDK validates lazily on use)', async () => {
      const config: FirebaseOptions = {
        apiKey: '',
        projectId: 'test-project',
      }

      // Firebase SDK accepts config at init time - validation happens when services are used
      const app = initializeApp(config, 'empty-api-key-test')
      expect(app).toBeDefined()
      await deleteApp(app)
    })

    it('should accept missing apiKey (SDK validates lazily on use)', async () => {
      // @ts-expect-error - Testing runtime behavior with invalid config
      const config: FirebaseOptions = {
        projectId: 'test-project',
        // Missing apiKey
      }

      // Firebase SDK accepts config at init time - validation happens when services are used
      const app = initializeApp(config, 'missing-api-key-test')
      expect(app).toBeDefined()
      await deleteApp(app)
    })
  })

  describe('firebase.do Specific Configuration', () => {
    it('should support firebase.do API endpoint configuration', () => {
      // This test validates that we can configure apps to use firebase.do
      // as the backend instead of Google's Firebase
      const config: FirebaseOptions = {
        apiKey: 'firebase-do-key',
        projectId: 'firebase-do-project',
        authDomain: 'auth.firebase.do',
        databaseURL: 'https://firebase-do-project.db.firebase.do',
        storageBucket: 'firebase-do-project.storage.firebase.do',
      }

      const app = initializeApp(config)

      // Verify the app is configured with firebase.do endpoints
      expect(app.options.authDomain).toContain('firebase.do')
      expect(app.options.databaseURL).toContain('firebase.do')
      expect(app.options.storageBucket).toContain('firebase.do')
    })

    it('should be able to access app options after initialization', () => {
      const config: FirebaseOptions = {
        apiKey: 'options-test-key',
        projectId: 'options-test-project',
        authDomain: 'auth.firebase.do',
      }

      const app = initializeApp(config)

      // App options should be immutable and accessible
      expect(app.options).toBeDefined()
      expect(typeof app.options).toBe('object')
      expect(Object.keys(app.options)).toContain('apiKey')
      expect(Object.keys(app.options)).toContain('projectId')
    })

    it('should preserve custom configuration through app lifecycle', async () => {
      const config: FirebaseOptions = {
        apiKey: 'lifecycle-key',
        projectId: 'lifecycle-project',
        authDomain: 'auth.firebase.do',
        databaseURL: 'https://lifecycle.db.firebase.do',
      }

      const app = initializeApp(config, 'lifecycle-app')

      // Retrieve app and verify config is preserved
      const retrieved = getApp('lifecycle-app')
      expect(retrieved.options.databaseURL).toBe(config.databaseURL)

      // Delete and verify it's gone
      await deleteApp(app)
      expect(() => getApp('lifecycle-app')).toThrow()
    })
  })
})
