/**
 * Tests for Firebase Functions Client SDK
 *
 * Tests the client-side APIs that match the Firebase SDK interface:
 * - getFunctions() - Get a Functions instance
 * - httpsCallable() - Create a callable function reference
 * - httpsCallableFromURL() - Create a callable function reference from a URL
 * - connectFunctionsEmulator() - Connect to a local Functions emulator
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import {
  getFunctions,
  httpsCallable,
  httpsCallableFromURL,
  connectFunctionsEmulator,
  setAuthTokenProvider,
  clearFunctionsInstances,
  FunctionsError,
  type Functions,
  type FirebaseApp,
} from '../../src/functions/client'
import {
  handleCallable,
  registerFunction,
  clearFunctions,
  setProjectId,
  CallableError,
} from '../../src/functions/callable'
import { generateFirebaseToken } from '../../src/auth/jwt'

// Test project ID for JWT verification
const TEST_PROJECT_ID = 'demo-project'

// Mock fetch for testing
const originalFetch = global.fetch

describe('Firebase Functions Client SDK', () => {
  beforeAll(() => {
    // Set project ID for JWT verification
    setProjectId(TEST_PROJECT_ID)

    // Register test functions
    registerFunction('echo', (data) => data)
    registerFunction('add', (data: { a: number; b: number }) => ({ sum: data.a + data.b }))
    registerFunction('error', () => {
      throw new CallableError('INVALID_ARGUMENT', 'Test error')
    })
    registerFunction('authRequired', (data, context) => {
      if (!context.auth) {
        throw new CallableError('UNAUTHENTICATED', 'Authentication required')
      }
      return { uid: context.auth.uid, data }
    })
  })

  afterAll(() => {
    clearFunctions()
    global.fetch = originalFetch
  })

  beforeEach(() => {
    clearFunctionsInstances()
    setAuthTokenProvider(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getFunctions()', () => {
    it('should return a Functions instance with default app', () => {
      const functions = getFunctions()

      expect(functions).toBeDefined()
      expect(functions.app).toBeDefined()
      expect(functions.app.name).toBe('[DEFAULT]')
      expect(functions.region).toBe('us-central1')
      expect(functions.customDomain).toBeNull()
    })

    it('should return a Functions instance with custom app', () => {
      const app: FirebaseApp = {
        name: 'my-app',
        options: { projectId: 'my-project' },
      }

      const functions = getFunctions(app)

      expect(functions.app).toBe(app)
      expect(functions.region).toBe('us-central1')
    })

    it('should return a Functions instance with custom region', () => {
      const functions = getFunctions(undefined, 'europe-west1')

      expect(functions.region).toBe('europe-west1')
      expect(functions.customDomain).toBeNull()
    })

    it('should return a Functions instance with custom domain', () => {
      const functions = getFunctions(undefined, 'https://my-functions.example.com')

      expect(functions.region).toBe('us-central1')
      expect(functions.customDomain).toBe('https://my-functions.example.com')
    })

    it('should return the same instance for the same app and region', () => {
      const functions1 = getFunctions(undefined, 'us-east1')
      const functions2 = getFunctions(undefined, 'us-east1')

      expect(functions1).toBe(functions2)
    })

    it('should return different instances for different regions', () => {
      const functions1 = getFunctions(undefined, 'us-central1')
      const functions2 = getFunctions(undefined, 'europe-west1')

      expect(functions1).not.toBe(functions2)
    })
  })

  describe('connectFunctionsEmulator()', () => {
    it('should configure emulator connection', () => {
      const functions = getFunctions()
      connectFunctionsEmulator(functions, 'localhost', 5001)

      expect(functions._emulatorConfig).toEqual({ host: 'localhost', port: 5001 })
    })
  })

  describe('httpsCallable()', () => {
    it('should create a callable function reference', () => {
      const functions = getFunctions()
      const callable = httpsCallable(functions, 'echo')

      expect(callable).toBeDefined()
      expect(typeof callable).toBe('function')
      expect(typeof callable.stream).toBe('function')
    })

    it('should call a function and return the result', async () => {
      const functions = getFunctions()
      connectFunctionsEmulator(functions, 'localhost', 5001)

      // Mock fetch to simulate server response
      global.fetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
        // Parse the request and call our server-side handler
        const body = JSON.parse(options.body as string)
        const request = {
          method: options.method || 'POST',
          headers: Object.fromEntries(
            Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
          ),
          body,
        }

        // Extract function name from URL
        const functionName = url.split('/').pop()!
        const response = await handleCallable(functionName, request)

        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: response.headers,
        })
      })

      const callable = httpsCallable<{ message: string }, { message: string }>(functions, 'echo')
      const result = await callable({ message: 'Hello' })

      expect(result.data).toEqual({ message: 'Hello' })
    })

    it('should handle function errors', async () => {
      const functions = getFunctions()
      connectFunctionsEmulator(functions, 'localhost', 5001)

      // Mock fetch to simulate error response
      global.fetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string)
        const request = {
          method: options.method || 'POST',
          headers: Object.fromEntries(
            Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
          ),
          body,
        }

        const functionName = url.split('/').pop()!
        const response = await handleCallable(functionName, request)

        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: response.headers,
        })
      })

      const callable = httpsCallable(functions, 'error')

      await expect(callable()).rejects.toThrow(FunctionsError)
      await expect(callable()).rejects.toMatchObject({
        code: 'functions/invalid-argument',
        message: 'Test error',
      })
    })

    it('should include auth token when provider is set', async () => {
      const functions = getFunctions()
      connectFunctionsEmulator(functions, 'localhost', 5001)

      // Generate a valid token
      const token = await generateFirebaseToken({
        uid: 'test-user',
        projectId: TEST_PROJECT_ID,
      })

      // Set auth token provider
      setAuthTokenProvider(async () => token)

      // Mock fetch to capture headers
      let capturedHeaders: Record<string, string> = {}
      global.fetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
        capturedHeaders = Object.fromEntries(
          Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v as string])
        )

        const body = JSON.parse(options.body as string)
        const request = {
          method: options.method || 'POST',
          headers: capturedHeaders,
          body,
        }

        const functionName = url.split('/').pop()!
        const response = await handleCallable(functionName, request)

        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: response.headers,
        })
      })

      const callable = httpsCallable(functions, 'authRequired')
      const result = await callable({ test: 'data' })

      expect(capturedHeaders['authorization']).toBe(`Bearer ${token}`)
      expect(result.data).toMatchObject({ uid: 'test-user' })
    })

    it('should handle timeout', async () => {
      const functions = getFunctions()
      connectFunctionsEmulator(functions, 'localhost', 5001)

      // Mock fetch to simulate timeout
      global.fetch = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
        // Wait for abort signal
        return new Promise((_, reject) => {
          const signal = options.signal
          if (signal) {
            signal.addEventListener('abort', () => {
              const error = new Error('Aborted')
              error.name = 'AbortError'
              reject(error)
            })
          }
        })
      })

      // Create callable with short timeout
      const callable = httpsCallable(functions, 'echo', { timeout: 10 })

      await expect(callable()).rejects.toThrow(FunctionsError)
      await expect(callable()).rejects.toMatchObject({
        code: 'functions/deadline-exceeded',
      })
    })

    it('should handle network errors', async () => {
      const functions = getFunctions()
      connectFunctionsEmulator(functions, 'localhost', 5001)

      // Mock fetch to simulate network error
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

      const callable = httpsCallable(functions, 'echo')

      await expect(callable()).rejects.toThrow(FunctionsError)
      await expect(callable()).rejects.toMatchObject({
        code: 'functions/unavailable',
      })
    })
  })

  describe('httpsCallableFromURL()', () => {
    it('should create a callable from a direct URL', async () => {
      const functions = getFunctions()

      // Mock fetch
      global.fetch = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string)
        return new Response(JSON.stringify({ result: body.data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const callable = httpsCallableFromURL(functions, 'https://example.com/myFunction')
      const result = await callable({ test: 'value' })

      expect(result.data).toEqual({ test: 'value' })
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/myFunction',
        expect.anything()
      )
    })
  })

  describe('FunctionsError', () => {
    it('should have correct code format', () => {
      const error = new FunctionsError('invalid-argument', 'Test message')

      expect(error.code).toBe('functions/invalid-argument')
      expect(error.message).toBe('Test message')
      expect(error.name).toBe('FunctionsError')
    })

    it('should include details when provided', () => {
      const details = { field: 'email', reason: 'Invalid format' }
      const error = new FunctionsError('invalid-argument', 'Validation failed', details)

      expect(error.details).toEqual(details)
    })

    it('should use code as default message', () => {
      const error = new FunctionsError('internal')

      expect(error.message).toBe('internal')
    })
  })

  describe('URL Building', () => {
    it('should build emulator URL correctly', async () => {
      const functions = getFunctions()
      connectFunctionsEmulator(functions, 'localhost', 5001)

      let capturedUrl = ''
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url
        return new Response(JSON.stringify({ result: {} }), { status: 200 })
      })

      const callable = httpsCallable(functions, 'myFunction')
      await callable()

      expect(capturedUrl).toBe('http://localhost:5001/demo-project/us-central1/myFunction')
    })

    it('should build custom domain URL correctly', async () => {
      const functions = getFunctions(undefined, 'https://functions.example.com')

      let capturedUrl = ''
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url
        return new Response(JSON.stringify({ result: {} }), { status: 200 })
      })

      const callable = httpsCallable(functions, 'myFunction')
      await callable()

      expect(capturedUrl).toBe('https://functions.example.com/myFunction')
    })

    it('should build production URL correctly', async () => {
      const app: FirebaseApp = {
        name: '[DEFAULT]',
        options: { projectId: 'my-project' },
      }
      const functions = getFunctions(app, 'europe-west1')

      let capturedUrl = ''
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url
        return new Response(JSON.stringify({ result: {} }), { status: 200 })
      })

      const callable = httpsCallable(functions, 'myFunction')
      await callable()

      expect(capturedUrl).toBe('https://europe-west1-my-project.cloudfunctions.net/myFunction')
    })
  })

  describe('Type Safety', () => {
    it('should enforce request and response types', async () => {
      const functions = getFunctions()
      connectFunctionsEmulator(functions, 'localhost', 5001)

      global.fetch = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string)
        const request = {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        }
        const response = await handleCallable('add', request)
        return new Response(JSON.stringify(response.body), { status: response.status })
      })

      interface AddRequest {
        a: number
        b: number
      }

      interface AddResponse {
        sum: number
      }

      const addNumbers = httpsCallable<AddRequest, AddResponse>(functions, 'add')
      const result = await addNumbers({ a: 2, b: 3 })

      // TypeScript should know that result.data has type AddResponse
      expect(result.data.sum).toBe(5)
    })
  })
})
