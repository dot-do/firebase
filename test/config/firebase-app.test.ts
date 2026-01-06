/**
 * Tests for FirebaseApp configuration
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  initializeApp,
  getApp,
  getApps,
  deleteApp,
  clearApps,
  buildServiceUrl,
  buildFirestoreUrl,
  buildStorageUrl,
  DEFAULT_EMULATOR_PORTS,
  PRODUCTION_ENDPOINTS,
  type FirebaseAppConfig,
  type FirebaseApp,
} from '../../src/config/firebase-app.js'

describe('FirebaseApp Configuration', () => {
  beforeEach(() => {
    clearApps()
  })

  describe('initializeApp', () => {
    it('should initialize an app with minimal config', () => {
      const app = initializeApp({ projectId: 'test-project' })

      expect(app.name).toBe('[DEFAULT]')
      expect(app.config.projectId).toBe('test-project')
      expect(app.config.storageBucket).toBe('test-project.appspot.com')
    })

    it('should initialize an app with a custom name', () => {
      const app = initializeApp({ projectId: 'test-project' }, 'my-app')

      expect(app.name).toBe('my-app')
    })

    it('should throw if app with same name already exists', () => {
      initializeApp({ projectId: 'test-project' })

      expect(() => initializeApp({ projectId: 'test-project' })).toThrow(
        'Firebase App named "[DEFAULT]" already exists'
      )
    })

    it('should throw if projectId is missing', () => {
      expect(() => initializeApp({} as FirebaseAppConfig)).toThrow(
        'projectId is required'
      )
    })

    it('should throw if projectId has invalid characters', () => {
      expect(() => initializeApp({ projectId: 'Test_Project' })).toThrow(
        'projectId must contain only lowercase letters, numbers, and hyphens'
      )
    })

    it('should validate custom endpoint URLs', () => {
      expect(() =>
        initializeApp({
          projectId: 'test-project',
          endpoints: {
            auth: { url: 'not-a-valid-url' },
          },
        })
      ).toThrow('invalid URL for auth endpoint')
    })

    it('should throw if endpoint has no URL', () => {
      expect(() =>
        initializeApp({
          projectId: 'test-project',
          endpoints: {
            auth: {} as any,
          },
        })
      ).toThrow('endpoint for auth must have a url')
    })

    it('should initialize with full config', () => {
      const app = initializeApp({
        projectId: 'test-project',
        apiKey: 'test-api-key',
        appId: 'test-app-id',
        authDomain: 'test-project.firebaseapp.com',
        storageBucket: 'custom-bucket.appspot.com',
        messagingSenderId: '123456789',
        measurementId: 'G-XXXXXXX',
        databaseURL: 'https://test-project.firebaseio.com',
      })

      expect(app.config.apiKey).toBe('test-api-key')
      expect(app.config.appId).toBe('test-app-id')
      expect(app.config.storageBucket).toBe('custom-bucket.appspot.com')
    })
  })

  describe('getApp', () => {
    it('should get the default app', () => {
      const created = initializeApp({ projectId: 'test-project' })
      const retrieved = getApp()

      expect(retrieved).toBe(created)
    })

    it('should get a named app', () => {
      const created = initializeApp({ projectId: 'test-project' }, 'my-app')
      const retrieved = getApp('my-app')

      expect(retrieved).toBe(created)
    })

    it('should throw if app does not exist', () => {
      expect(() => getApp('non-existent')).toThrow(
        'No Firebase App "non-existent" has been created'
      )
    })
  })

  describe('getApps', () => {
    it('should return empty array when no apps', () => {
      expect(getApps()).toEqual([])
    })

    it('should return all initialized apps', () => {
      const app1 = initializeApp({ projectId: 'project-1' }, 'app1')
      const app2 = initializeApp({ projectId: 'project-2' }, 'app2')

      const apps = getApps()

      expect(apps).toHaveLength(2)
      expect(apps).toContain(app1)
      expect(apps).toContain(app2)
    })
  })

  describe('deleteApp', () => {
    it('should delete an app', () => {
      const app = initializeApp({ projectId: 'test-project' })

      deleteApp(app)

      expect(() => getApp()).toThrow()
    })

    it('should allow reinitializing after delete', () => {
      const app1 = initializeApp({ projectId: 'test-project' })
      deleteApp(app1)

      const app2 = initializeApp({ projectId: 'test-project' })

      expect(app2.config.projectId).toBe('test-project')
    })
  })

  describe('Production Endpoints', () => {
    it('should use production endpoints by default', () => {
      const app = initializeApp({ projectId: 'test-project' })

      expect(app.endpoints.auth.url).toBe(PRODUCTION_ENDPOINTS.auth.url)
      expect(app.endpoints.auth.pathPrefix).toBe(PRODUCTION_ENDPOINTS.auth.pathPrefix)
      expect(app.endpoints.firestore.url).toBe(PRODUCTION_ENDPOINTS.firestore.url)
      expect(app.endpoints.storage.url).toBe(PRODUCTION_ENDPOINTS.storage.url)
    })

    it('should build database URL from projectId', () => {
      const app = initializeApp({ projectId: 'test-project' })

      expect(app.endpoints.database.url).toBe(
        'https://test-project-default-rtdb.firebaseio.com'
      )
    })
  })

  describe('Emulator Mode', () => {
    it('should use emulator endpoints when useEmulator is true', () => {
      const app = initializeApp({
        projectId: 'test-project',
        useEmulator: true,
      })

      expect(app.isEmulatorMode()).toBe(true)
      expect(app.endpoints.auth.url).toBe(`http://localhost:${DEFAULT_EMULATOR_PORTS.auth}`)
      expect(app.endpoints.firestore.url).toBe(`http://localhost:${DEFAULT_EMULATOR_PORTS.firestore}`)
      expect(app.endpoints.storage.url).toBe(`http://localhost:${DEFAULT_EMULATOR_PORTS.storage}`)
      expect(app.endpoints.functions.url).toBe(`http://localhost:${DEFAULT_EMULATOR_PORTS.functions}`)
      expect(app.endpoints.database.url).toBe(`http://localhost:${DEFAULT_EMULATOR_PORTS.database}`)
    })

    it('should use custom emulator host', () => {
      const app = initializeApp({
        projectId: 'test-project',
        useEmulator: true,
        emulatorHost: '192.168.1.100',
      })

      expect(app.endpoints.auth.url).toBe(`http://192.168.1.100:${DEFAULT_EMULATOR_PORTS.auth}`)
    })

    it('should set auth path prefix for emulator', () => {
      const app = initializeApp({
        projectId: 'test-project',
        useEmulator: true,
      })

      expect(app.endpoints.auth.pathPrefix).toBe('/identitytoolkit/v3')
    })
  })

  describe('Custom Endpoints', () => {
    it('should use custom endpoints when provided', () => {
      const app = initializeApp({
        projectId: 'test-project',
        endpoints: {
          auth: { url: 'https://auth.firebase.do', pathPrefix: '/v1' },
          firestore: { url: 'https://firestore.firebase.do' },
          storage: { url: 'https://storage.firebase.do', pathPrefix: '/v0' },
        },
      })

      expect(app.endpoints.auth.url).toBe('https://auth.firebase.do')
      expect(app.endpoints.auth.pathPrefix).toBe('/v1')
      expect(app.endpoints.firestore.url).toBe('https://firestore.firebase.do')
      expect(app.endpoints.storage.url).toBe('https://storage.firebase.do')
      expect(app.endpoints.storage.pathPrefix).toBe('/v0')
    })

    it('should mix custom and default endpoints', () => {
      const app = initializeApp({
        projectId: 'test-project',
        endpoints: {
          auth: { url: 'https://auth.custom.com' },
        },
      })

      expect(app.endpoints.auth.url).toBe('https://auth.custom.com')
      expect(app.endpoints.firestore.url).toBe(PRODUCTION_ENDPOINTS.firestore.url)
    })

    it('should prefer custom endpoints over emulator', () => {
      const app = initializeApp({
        projectId: 'test-project',
        useEmulator: true,
        endpoints: {
          auth: { url: 'https://auth.custom.com' },
        },
      })

      expect(app.endpoints.auth.url).toBe('https://auth.custom.com')
      expect(app.endpoints.firestore.url).toContain('localhost')
    })
  })

  describe('getEndpoint', () => {
    it('should return the endpoint for a service', () => {
      const app = initializeApp({ projectId: 'test-project' })

      const authEndpoint = app.getEndpoint('auth')

      expect(authEndpoint.url).toBe(PRODUCTION_ENDPOINTS.auth.url)
    })
  })

  describe('buildServiceUrl', () => {
    it('should build URL with path prefix', () => {
      const app = initializeApp({ projectId: 'test-project' })

      const url = buildServiceUrl(app, 'auth', '/accounts:signUp')

      expect(url).toBe('https://identitytoolkit.googleapis.com/v1/accounts:signUp')
    })

    it('should build URL without leading slash', () => {
      const app = initializeApp({ projectId: 'test-project' })

      const url = buildServiceUrl(app, 'auth', 'accounts:signUp')

      expect(url).toBe('https://identitytoolkit.googleapis.com/v1/accounts:signUp')
    })

    it('should build URL for custom endpoint', () => {
      const app = initializeApp({
        projectId: 'test-project',
        endpoints: {
          auth: { url: 'https://auth.firebase.do', pathPrefix: '/api' },
        },
      })

      const url = buildServiceUrl(app, 'auth', '/accounts:signUp')

      expect(url).toBe('https://auth.firebase.do/api/accounts:signUp')
    })
  })

  describe('buildFirestoreUrl', () => {
    it('should build Firestore document URL', () => {
      const app = initializeApp({ projectId: 'test-project' })

      const url = buildFirestoreUrl(app, 'users/user123')

      expect(url).toBe(
        'https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents/users/user123'
      )
    })

    it('should handle leading slash in path', () => {
      const app = initializeApp({ projectId: 'test-project' })

      const url = buildFirestoreUrl(app, '/users/user123')

      expect(url).toBe(
        'https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents/users/user123'
      )
    })

    it('should work with custom Firestore endpoint', () => {
      const app = initializeApp({
        projectId: 'test-project',
        endpoints: {
          firestore: { url: 'https://firestore.firebase.do', pathPrefix: '/v1' },
        },
      })

      const url = buildFirestoreUrl(app, 'users/user123')

      expect(url).toBe(
        'https://firestore.firebase.do/v1/projects/test-project/databases/(default)/documents/users/user123'
      )
    })
  })

  describe('buildStorageUrl', () => {
    it('should build Storage object URL', () => {
      const app = initializeApp({ projectId: 'test-project' })

      const url = buildStorageUrl(app, 'images/photo.jpg')

      expect(url).toBe(
        'https://storage.googleapis.com/v0/b/test-project.appspot.com/o/images%2Fphoto.jpg'
      )
    })

    it('should handle custom bucket', () => {
      const app = initializeApp({ projectId: 'test-project' })

      const url = buildStorageUrl(app, 'images/photo.jpg', 'custom-bucket')

      expect(url).toBe(
        'https://storage.googleapis.com/v0/b/custom-bucket/o/images%2Fphoto.jpg'
      )
    })

    it('should work with custom Storage endpoint', () => {
      const app = initializeApp({
        projectId: 'test-project',
        endpoints: {
          storage: { url: 'https://storage.firebase.do', pathPrefix: '/v0' },
        },
      })

      const url = buildStorageUrl(app, 'images/photo.jpg')

      expect(url).toBe(
        'https://storage.firebase.do/v0/b/test-project.appspot.com/o/images%2Fphoto.jpg'
      )
    })

    it('should use custom storageBucket from config', () => {
      const app = initializeApp({
        projectId: 'test-project',
        storageBucket: 'my-custom-bucket.appspot.com',
      })

      const url = buildStorageUrl(app, 'file.txt')

      expect(url).toContain('my-custom-bucket.appspot.com')
    })
  })

  describe('Config Immutability', () => {
    it('should freeze config object', () => {
      const app = initializeApp({ projectId: 'test-project' })

      expect(Object.isFrozen(app.config)).toBe(true)
    })

    it('should freeze endpoints object', () => {
      const app = initializeApp({ projectId: 'test-project' })

      expect(Object.isFrozen(app.endpoints)).toBe(true)
    })
  })
})
