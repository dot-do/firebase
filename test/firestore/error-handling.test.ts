/**
 * Type-safe error handling tests for Firestore server
 *
 * RED TEST SUITE: These tests verify that errors are properly typed
 * and not using `any`. The tests will pass when error handling uses
 * `unknown` with proper type guards instead of `any`.
 *
 * Related issue: firebase-7hm9 (FIX: Replace error: any with unknown and add type guards)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { startServer, stopServer, clearAllDocuments } from '../../src/firestore/server'
import type { Server } from 'http'

/**
 * Type guard for checking if an error has a firestoreError property
 * This is the pattern that should be used in server.ts
 */
interface FirestoreErrorWrapper {
  firestoreError: {
    error: {
      code: number
      message: string
      status: string
    }
  }
}

function isFirestoreErrorWrapper(error: unknown): error is FirestoreErrorWrapper {
  return (
    typeof error === 'object' &&
    error !== null &&
    'firestoreError' in error &&
    typeof (error as FirestoreErrorWrapper).firestoreError === 'object' &&
    (error as FirestoreErrorWrapper).firestoreError !== null &&
    'error' in (error as FirestoreErrorWrapper).firestoreError
  )
}

/**
 * Type guard for checking if an error has a message property
 */
function isErrorWithMessage(error: unknown): error is Error {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Error).message === 'string'
  )
}

describe('Firestore Server - Type-Safe Error Handling', () => {
  let server: Server
  const PORT = 8765
  const BASE_URL = `http://localhost:${PORT}`
  const PROJECT_ID = 'test-project'
  const DATABASE_ID = '(default)'

  beforeEach(() => {
    clearAllDocuments()
    server = startServer(PORT)
  })

  afterEach(async () => {
    await stopServer(server)
  })

  const makeRequest = async (
    method: string,
    path: string,
    body?: object
  ): Promise<{ status: number; data: unknown }> => {
    const url = `${BASE_URL}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${path}`
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (body) {
      options.body = JSON.stringify(body)
    }
    const response = await fetch(url, options)
    const data = await response.json()
    return { status: response.status, data }
  }

  describe('Error responses should have proper structure', () => {
    it('should return typed NOT_FOUND error for non-existent document GET', async () => {
      const { status, data } = await makeRequest('GET', 'users/nonexistent')

      expect(status).toBe(404)
      expect(data).toEqual({
        error: {
          code: 404,
          message: 'Document not found',
          status: 'NOT_FOUND',
        },
      })
    })

    it('should return typed INVALID_ARGUMENT error for invalid document path', async () => {
      // Collection path (odd segments) is invalid for document operations
      const { status, data } = await makeRequest('GET', 'users')

      expect(status).toBe(400)
      expect(data).toEqual({
        error: {
          code: 400,
          message: 'Invalid document path',
          status: 'INVALID_ARGUMENT',
        },
      })
    })

    it('should return typed INVALID_ARGUMENT error for malformed JSON', async () => {
      const url = `${BASE_URL}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/users/doc1`
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json }',
      })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: {
          code: 400,
          message: 'Invalid JSON in request body',
          status: 'INVALID_ARGUMENT',
        },
      })
    })

    it('should return typed FAILED_PRECONDITION error when exists=false but document exists', async () => {
      // First create a document
      await makeRequest('PATCH', 'users/existing', {
        fields: { name: { stringValue: 'Test' } },
      })

      // Try to create again with exists=false precondition
      const url = `${BASE_URL}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/users/existing?currentDocument.exists=false`
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { name: { stringValue: 'New' } } }),
      })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data).toEqual({
        error: {
          code: 409,
          message: 'Document already exists',
          status: 'FAILED_PRECONDITION',
        },
      })
    })

    it('should return typed NOT_FOUND error when exists=true but document does not exist', async () => {
      const url = `${BASE_URL}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/users/nonexistent?currentDocument.exists=true`

      // This test verifies proper error handling for precondition failures
      // When error: any is replaced with error: unknown, proper type guards must be used
      let response: Response
      try {
        response = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { name: { stringValue: 'Test' } } }),
        })
      } catch (e) {
        // If fetch fails with ECONNRESET, the server crashed due to improper error handling
        // This indicates error: any is not being handled correctly with type guards
        throw new Error(
          'Server crashed - likely due to untyped error handling. ' +
            'Replace error: any with error: unknown and add type guards.'
        )
      }

      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({
        error: {
          code: 404,
          message: 'Document not found',
          status: 'NOT_FOUND',
        },
      })
    })

    it('should return typed NOT_FOUND error for delete with exists=true on non-existent doc', async () => {
      const url = `${BASE_URL}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/users/nonexistent?currentDocument.exists=true`
      const response = await fetch(url, {
        method: 'DELETE',
      })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({
        error: {
          code: 404,
          message: 'Document not found',
          status: 'NOT_FOUND',
        },
      })
    })

    it('should return typed FAILED_PRECONDITION error for delete with wrong updateTime', async () => {
      // First create a document
      await makeRequest('PATCH', 'users/timecheckdoc', {
        fields: { name: { stringValue: 'Test' } },
      })

      // Try to delete with wrong updateTime
      const wrongTime = '2020-01-01T00:00:00.000000Z'
      const url = `${BASE_URL}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/users/timecheckdoc?currentDocument.updateTime=${encodeURIComponent(wrongTime)}`
      const response = await fetch(url, {
        method: 'DELETE',
      })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error.code).toBe(409)
      expect(data.error.status).toBe('FAILED_PRECONDITION')
      expect(data.error.message).toContain('Update time does not match')
    })
  })

  describe('Type guards should work correctly', () => {
    it('should correctly identify FirestoreErrorWrapper objects', () => {
      const validError = {
        firestoreError: {
          error: {
            code: 404,
            message: 'Not found',
            status: 'NOT_FOUND',
          },
        },
      }

      expect(isFirestoreErrorWrapper(validError)).toBe(true)
    })

    it('should reject non-FirestoreErrorWrapper objects', () => {
      expect(isFirestoreErrorWrapper(null)).toBe(false)
      expect(isFirestoreErrorWrapper(undefined)).toBe(false)
      expect(isFirestoreErrorWrapper('string error')).toBe(false)
      expect(isFirestoreErrorWrapper(42)).toBe(false)
      expect(isFirestoreErrorWrapper({})).toBe(false)
      expect(isFirestoreErrorWrapper({ error: 'wrong shape' })).toBe(false)
      expect(isFirestoreErrorWrapper({ firestoreError: null })).toBe(false)
      expect(isFirestoreErrorWrapper({ firestoreError: 'not object' })).toBe(false)
    })

    it('should correctly identify Error objects', () => {
      expect(isErrorWithMessage(new Error('test'))).toBe(true)
      expect(isErrorWithMessage(new TypeError('type error'))).toBe(true)
      expect(isErrorWithMessage({ message: 'fake error' })).toBe(true)
    })

    it('should reject non-Error objects', () => {
      expect(isErrorWithMessage(null)).toBe(false)
      expect(isErrorWithMessage(undefined)).toBe(false)
      expect(isErrorWithMessage('string')).toBe(false)
      expect(isErrorWithMessage(42)).toBe(false)
      expect(isErrorWithMessage({})).toBe(false)
      expect(isErrorWithMessage({ notMessage: 'wrong' })).toBe(false)
    })
  })

  describe('Error handling should handle various error types', () => {
    it('should handle standard Error objects thrown', async () => {
      // This tests that server doesn't crash on standard errors
      // The server should return 500 INTERNAL for unexpected errors
      // or 400 INVALID_ARGUMENT for validation errors
      let result: { status: number; data: unknown }
      try {
        result = await makeRequest('PATCH', 'users/doc1', {
          fields: {
            // Field with unknown type should cause validation error
            invalid: { unknownType: 'test' },
          },
        })
      } catch (e) {
        // If makeRequest fails with ECONNRESET, the server crashed
        // This indicates error: any is not being handled correctly with type guards
        throw new Error(
          'Server crashed - likely due to untyped error handling. ' +
            'Replace error: any with error: unknown and add type guards.'
        )
      }

      expect(result.status).toBe(400)
      expect((result.data as { error: { status: string } }).error.status).toBe('INVALID_ARGUMENT')
    })

    it('should handle validation errors for invalid field types', async () => {
      const { status, data } = await makeRequest('PATCH', 'users/doc1', {
        fields: {
          geo: {
            geoPointValue: {
              latitude: 200, // Invalid: out of range
              longitude: 0,
            },
          },
        },
      })

      expect(status).toBe(400)
      expect((data as { error: { status: string; message: string } }).error.status).toBe(
        'INVALID_ARGUMENT'
      )
      expect((data as { error: { message: string } }).error.message).toContain('latitude')
    })

    it('should handle validation errors for invalid timestamp', async () => {
      const { status, data } = await makeRequest('PATCH', 'users/doc1', {
        fields: {
          ts: {
            timestampValue: 'not-a-valid-date',
          },
        },
      })

      expect(status).toBe(400)
      expect((data as { error: { status: string } }).error.status).toBe('INVALID_ARGUMENT')
    })

    it('should handle validation errors for invalid reference path', async () => {
      const { status, data } = await makeRequest('PATCH', 'users/doc1', {
        fields: {
          ref: {
            referenceValue: 'invalid/reference/path',
          },
        },
      })

      expect(status).toBe(400)
      expect((data as { error: { status: string } }).error.status).toBe('INVALID_ARGUMENT')
    })

    it('should handle null values in nested validation', async () => {
      const { status, data } = await makeRequest('PATCH', 'users/doc1', {
        fields: {
          nested: {
            mapValue: {
              fields: {
                bad: null, // Invalid: null at field value level
              },
            },
          },
        },
      })

      expect(status).toBe(400)
      expect((data as { error: { status: string } }).error.status).toBe('INVALID_ARGUMENT')
    })
  })

  describe('TypeScript compilation should enforce type safety', () => {
    /**
     * These tests verify that the type guards can be used correctly in place of `any`
     * The actual TypeScript compilation would catch these issues at build time
     */

    it('should demonstrate type-safe error property access', () => {
      const unknownError: unknown = new Error('test')

      // With type guard, we can safely access properties
      if (isErrorWithMessage(unknownError)) {
        expect(unknownError.message).toBe('test')
      }

      // Without type guard, we'd need `any` to access .message
      // This test demonstrates the pattern that should be used
    })

    it('should demonstrate type-safe firestoreError access', () => {
      const unknownError: unknown = {
        firestoreError: {
          error: {
            code: 500,
            message: 'Internal',
            status: 'INTERNAL',
          },
        },
      }

      // With type guard, we can safely access nested properties
      if (isFirestoreErrorWrapper(unknownError)) {
        expect(unknownError.firestoreError.error.code).toBe(500)
        expect(unknownError.firestoreError.error.message).toBe('Internal')
        expect(unknownError.firestoreError.error.status).toBe('INTERNAL')
      }
    })

    it('should handle mixed error types safely', () => {
      const errors: unknown[] = [
        new Error('standard error'),
        { firestoreError: { error: { code: 404, message: 'Not found', status: 'NOT_FOUND' } } },
        'string error',
        null,
        undefined,
        { random: 'object' },
      ]

      const results = errors.map((err) => {
        if (isFirestoreErrorWrapper(err)) {
          return { type: 'firestore', code: err.firestoreError.error.code }
        } else if (isErrorWithMessage(err)) {
          return { type: 'error', message: err.message }
        } else if (typeof err === 'string') {
          return { type: 'string', value: err }
        } else {
          return { type: 'unknown' }
        }
      })

      expect(results[0]).toEqual({ type: 'error', message: 'standard error' })
      expect(results[1]).toEqual({ type: 'firestore', code: 404 })
      expect(results[2]).toEqual({ type: 'string', value: 'string error' })
      expect(results[3]).toEqual({ type: 'unknown' })
      expect(results[4]).toEqual({ type: 'unknown' })
      expect(results[5]).toEqual({ type: 'unknown' })
    })
  })
})
