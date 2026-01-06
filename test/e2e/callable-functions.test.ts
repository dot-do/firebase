/**
 * E2E Tests: Callable Functions with Firebase SDK
 *
 * Issue: firebase-nt5
 *
 * These tests verify that callable functions can be invoked using the official
 * Firebase SDK (firebase/functions). The SDK uses the httpsCallable protocol
 * which requires a proper endpoint that handles:
 * - POST requests with JSON body containing { "data": {...} }
 * - Success responses returning { "result": {...} }
 * - Error responses returning { "error": { "message": "...", "status": "..." } }
 *
 * RED TESTS: These tests are expected to fail initially as they test
 * integration with firebase.do callable function endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { initializeApp, deleteApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword, deleteUser, type Auth } from 'firebase/auth'
import { getFunctions, connectFunctionsEmulator, httpsCallable, type Functions, type HttpsCallableResult } from 'firebase/functions'

/**
 * Firebase configuration for testing
 */
const FIREBASE_CONFIG = {
  projectId: 'test-project',
  apiKey: 'test-api-key-for-e2e-testing',
  authDomain: 'test-project.firebase.do',
}

const LOCAL_HOST = process.env.FIREBASE_DO_HOST || 'localhost'
const AUTH_PORT = parseInt(process.env.FIREBASE_DO_AUTH_PORT || '9099')
const FUNCTIONS_PORT = parseInt(process.env.FIREBASE_DO_FUNCTIONS_PORT || '5001')

describe('E2E: Callable Functions with Firebase SDK', () => {
  let app: FirebaseApp
  let auth: Auth
  let functions: Functions

  beforeAll(() => {
    app = initializeApp(FIREBASE_CONFIG, 'callable-functions-e2e-test')
    auth = getAuth(app)
    functions = getFunctions(app)

    // Connect to local emulators
    connectAuthEmulator(auth, `http://${LOCAL_HOST}:${AUTH_PORT}`, {
      disableWarnings: true,
    })
    connectFunctionsEmulator(functions, LOCAL_HOST, FUNCTIONS_PORT)
  })

  afterAll(async () => {
    const apps = getApps()
    for (const existingApp of apps) {
      await deleteApp(existingApp)
    }
  })

  describe('Basic Callable Function Invocation', () => {
    it('should invoke a callable function and receive result', async () => {
      // Get a reference to the callable function
      const testFn = httpsCallable(functions, 'testFunction')

      // Call the function with data
      const result = await testFn({ message: 'Hello from SDK!' })

      // Verify the result structure
      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
      expect(result.data).toHaveProperty('message', 'Success')
      expect(result.data).toHaveProperty('receivedData')
      expect((result.data as { receivedData: unknown }).receivedData).toEqual({ message: 'Hello from SDK!' })
    })

    it('should invoke echo function and return data as-is', async () => {
      const echoFn = httpsCallable(functions, 'echoFunction')

      const testData = {
        string: 'test',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        nested: { key: 'value' },
      }

      const result = await echoFn(testData)

      expect(result.data).toEqual(testData)
    })

    it('should handle null data input', async () => {
      const testFn = httpsCallable(functions, 'testFunction')

      const result = await testFn(null)

      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
    })

    it('should handle undefined data input', async () => {
      const testFn = httpsCallable(functions, 'testFunction')

      const result = await testFn(undefined)

      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
    })

    it('should handle primitive data types', async () => {
      const echoFn = httpsCallable(functions, 'echoFunction')

      // Test string
      const stringResult = await echoFn('hello')
      expect(stringResult.data).toBe('hello')

      // Test number
      const numberResult = await echoFn(42)
      expect(numberResult.data).toBe(42)

      // Test boolean
      const boolResult = await echoFn(true)
      expect(boolResult.data).toBe(true)

      // Test array
      const arrayResult = await echoFn([1, 2, 3])
      expect(arrayResult.data).toEqual([1, 2, 3])
    })
  })

  describe('Error Handling', () => {
    it('should throw error for non-existent function', async () => {
      const nonExistentFn = httpsCallable(functions, 'nonExistentFunction')

      await expect(nonExistentFn({})).rejects.toThrow()
    })

    it('should throw INVALID_ARGUMENT error with correct code', async () => {
      const errorFn = httpsCallable(functions, 'errorFunction')

      try {
        await errorFn({ throwError: 'INVALID_ARGUMENT' })
        expect.fail('Should have thrown an error')
      } catch (error: unknown) {
        expect(error).toBeDefined()
        // Firebase SDK wraps errors with code property
        expect((error as { code?: string }).code).toBe('functions/invalid-argument')
      }
    })

    it('should throw PERMISSION_DENIED error with correct code', async () => {
      const errorFn = httpsCallable(functions, 'errorFunction')

      try {
        await errorFn({ throwError: 'PERMISSION_DENIED' })
        expect.fail('Should have thrown an error')
      } catch (error: unknown) {
        expect(error).toBeDefined()
        expect((error as { code?: string }).code).toBe('functions/permission-denied')
      }
    })

    it('should throw UNAUTHENTICATED error with correct code', async () => {
      const errorFn = httpsCallable(functions, 'errorFunction')

      try {
        await errorFn({ throwError: 'UNAUTHENTICATED' })
        expect.fail('Should have thrown an error')
      } catch (error: unknown) {
        expect(error).toBeDefined()
        expect((error as { code?: string }).code).toBe('functions/unauthenticated')
      }
    })

    it('should throw INTERNAL error for server errors', async () => {
      const errorFn = httpsCallable(functions, 'errorFunction')

      try {
        await errorFn({ shouldFail: true })
        expect.fail('Should have thrown an error')
      } catch (error: unknown) {
        expect(error).toBeDefined()
        expect((error as { code?: string }).code).toBe('functions/internal')
      }
    })

    it('should include error details when provided', async () => {
      const errorFn = httpsCallable(functions, 'errorFunction')

      try {
        await errorFn({ errorWithDetails: true })
        expect.fail('Should have thrown an error')
      } catch (error: unknown) {
        expect(error).toBeDefined()
        // Firebase SDK exposes details property
        expect((error as { details?: unknown }).details).toBeDefined()
        expect((error as { details?: { field?: string } }).details?.field).toBe('someField')
      }
    })
  })

  describe('Authenticated Callable Functions', () => {
    let testUserEmail: string
    const testPassword = 'SecurePassword123!'

    beforeEach(async () => {
      // Create a test user for authenticated function calls
      testUserEmail = `callable-test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`
      await createUserWithEmailAndPassword(auth, testUserEmail, testPassword)
    })

    afterEach(async () => {
      // Clean up test user
      if (auth.currentUser) {
        await deleteUser(auth.currentUser)
      }
    })

    it('should pass authentication context to callable function', async () => {
      // User should already be signed in from beforeEach
      expect(auth.currentUser).toBeDefined()

      const authFn = httpsCallable(functions, 'authFunction')

      const result = await authFn({ testData: 'authenticated call' })

      expect(result.data).toBeDefined()
      const data = result.data as { auth?: { uid?: string; email?: string }; data?: unknown }
      expect(data.auth).toBeDefined()
      expect(data.auth?.uid).toBe(auth.currentUser?.uid)
      expect(data.auth?.email).toBe(testUserEmail)
      expect(data.data).toEqual({ testData: 'authenticated call' })
    })

    it('should include email verification status in auth context', async () => {
      const authFn = httpsCallable(functions, 'authFunction')

      const result = await authFn({})

      const data = result.data as { auth?: { emailVerified?: boolean } }
      expect(data.auth).toBeDefined()
      // New users are not verified by default
      expect(typeof data.auth?.emailVerified).toBe('boolean')
    })

    it('should reject authenticated-only function when not signed in', async () => {
      // Sign out first
      await auth.signOut()
      expect(auth.currentUser).toBeNull()

      const authFn = httpsCallable(functions, 'authFunction')

      try {
        await authFn({})
        expect.fail('Should have thrown an error')
      } catch (error: unknown) {
        expect(error).toBeDefined()
        expect((error as { code?: string }).code).toBe('functions/unauthenticated')
      }
    })
  })

  describe('Public Callable Functions', () => {
    it('should allow unauthenticated calls to public functions', async () => {
      // Ensure no user is signed in
      await auth.signOut()
      expect(auth.currentUser).toBeNull()

      const publicFn = httpsCallable(functions, 'publicFunction')

      const result = await publicFn({ publicData: 'test' })

      expect(result.data).toBeDefined()
      const data = result.data as { auth?: unknown; data?: unknown }
      expect(data.auth).toBeNull()
      expect(data.data).toEqual({ publicData: 'test' })
    })

    it('should pass auth context to public function when user is signed in', async () => {
      // Create and sign in user
      const email = `public-fn-test-${Date.now()}@example.com`
      const cred = await createUserWithEmailAndPassword(auth, email, 'SecurePassword123!')

      try {
        const publicFn = httpsCallable(functions, 'publicFunction')

        const result = await publicFn({ data: 'with auth' })

        const data = result.data as { auth?: { uid?: string } }
        expect(data.auth).toBeDefined()
        expect(data.auth?.uid).toBe(cred.user.uid)
      } finally {
        // Clean up
        await deleteUser(cred.user)
      }
    })
  })

  describe('Large Payload Handling', () => {
    it('should handle moderately sized payloads', async () => {
      const echoFn = httpsCallable(functions, 'echoFunction')

      // Create a payload with multiple items (but within reasonable size)
      const payload = {
        items: Array(100).fill(null).map((_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: 'x'.repeat(100),
        })),
      }

      const result = await echoFn(payload)

      expect(result.data).toEqual(payload)
    })

    it('should handle nested data structures', async () => {
      const echoFn = httpsCallable(functions, 'echoFunction')

      const nestedData = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deeply nested',
              },
            },
          },
        },
      }

      const result = await echoFn(nestedData)

      expect(result.data).toEqual(nestedData)
    })
  })

  describe('Concurrent Function Calls', () => {
    it('should handle multiple concurrent function calls', async () => {
      const echoFn = httpsCallable(functions, 'echoFunction')

      // Make 5 concurrent calls
      const calls = Array(5).fill(null).map((_, i) =>
        echoFn({ callId: i })
      )

      const results = await Promise.all(calls)

      // Verify all calls completed
      expect(results).toHaveLength(5)
      results.forEach((result, i) => {
        expect(result.data).toEqual({ callId: i })
      })
    })

    it('should maintain data integrity across concurrent calls', async () => {
      const echoFn = httpsCallable(functions, 'echoFunction')

      // Make concurrent calls with unique identifiers
      const uniqueIds = Array(10).fill(null).map(() =>
        Math.random().toString(36).substring(7)
      )

      const calls = uniqueIds.map(id => echoFn({ uniqueId: id }))
      const results = await Promise.all(calls)

      // Verify each call returned its own unique ID
      const returnedIds = results.map(r => (r.data as { uniqueId: string }).uniqueId)
      expect(new Set(returnedIds).size).toBe(10) // All unique
      expect(returnedIds.sort()).toEqual(uniqueIds.sort())
    })
  })

  describe('SDK Integration', () => {
    it('should verify Functions instance is properly initialized', () => {
      expect(functions).toBeDefined()
      expect(functions.app).toBe(app)
    })

    it('should use correct region when specified', () => {
      // Get functions for a specific region
      const regionalFunctions = getFunctions(app, 'us-central1')

      expect(regionalFunctions).toBeDefined()
      expect(regionalFunctions.app).toBe(app)
    })

    it('should work with custom domain configuration', () => {
      // This tests that the SDK can be configured with custom endpoints
      const customFunctions = getFunctions(app)
      connectFunctionsEmulator(customFunctions, LOCAL_HOST, FUNCTIONS_PORT)

      expect(customFunctions).toBeDefined()
    })
  })
})

describe('E2E: Callable Functions Error Scenarios', () => {
  let app: FirebaseApp
  let functions: Functions

  beforeAll(() => {
    app = initializeApp(FIREBASE_CONFIG, 'callable-error-scenarios-test')
    functions = getFunctions(app)
    connectFunctionsEmulator(functions, LOCAL_HOST, FUNCTIONS_PORT)
  })

  afterAll(async () => {
    const apps = getApps()
    for (const existingApp of apps) {
      await deleteApp(existingApp)
    }
  })

  describe('All Firebase Error Codes', () => {
    const errorCodes = [
      { firebaseCode: 'INVALID_ARGUMENT', sdkCode: 'functions/invalid-argument' },
      { firebaseCode: 'FAILED_PRECONDITION', sdkCode: 'functions/failed-precondition' },
      { firebaseCode: 'OUT_OF_RANGE', sdkCode: 'functions/out-of-range' },
      { firebaseCode: 'UNAUTHENTICATED', sdkCode: 'functions/unauthenticated' },
      { firebaseCode: 'PERMISSION_DENIED', sdkCode: 'functions/permission-denied' },
      { firebaseCode: 'NOT_FOUND', sdkCode: 'functions/not-found' },
      { firebaseCode: 'ALREADY_EXISTS', sdkCode: 'functions/already-exists' },
      { firebaseCode: 'ABORTED', sdkCode: 'functions/aborted' },
      { firebaseCode: 'RESOURCE_EXHAUSTED', sdkCode: 'functions/resource-exhausted' },
      { firebaseCode: 'CANCELLED', sdkCode: 'functions/cancelled' },
      { firebaseCode: 'INTERNAL', sdkCode: 'functions/internal' },
      { firebaseCode: 'UNAVAILABLE', sdkCode: 'functions/unavailable' },
      { firebaseCode: 'DEADLINE_EXCEEDED', sdkCode: 'functions/deadline-exceeded' },
    ]

    it.each(errorCodes)(
      'should map $firebaseCode to SDK error code $sdkCode',
      async ({ firebaseCode, sdkCode }) => {
        const errorFn = httpsCallable(functions, 'errorFunction')

        try {
          await errorFn({ throwError: firebaseCode })
          expect.fail(`Should have thrown ${firebaseCode} error`)
        } catch (error: unknown) {
          expect((error as { code?: string }).code).toBe(sdkCode)
        }
      }
    )
  })

  describe('Timeout Handling', () => {
    it('should handle DEADLINE_EXCEEDED error', async () => {
      const slowFn = httpsCallable(functions, 'slowFunction')

      try {
        await slowFn({ timeout: true })
        expect.fail('Should have thrown timeout error')
      } catch (error: unknown) {
        expect((error as { code?: string }).code).toBe('functions/deadline-exceeded')
      }
    })
  })
})
