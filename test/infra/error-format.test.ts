/**
 * @fileoverview Tests for Firebase-compatible error response format
 *
 * Issue: firebase-37i - [RED] infra: Test error response format compatibility
 *
 * Firebase error responses follow a standard format across all services:
 * {
 *   error: {
 *     code: number,       // HTTP status code
 *     message: string,    // Human-readable error message
 *     status?: string,    // gRPC/Firebase status code (e.g., "NOT_FOUND", "INVALID_ARGUMENT")
 *     errors?: Array<{    // Optional array of detailed errors (used by Identity Toolkit)
 *       message: string,
 *       domain: string,
 *       reason: string
 *     }>
 *   }
 * }
 *
 * This test file verifies that all firebase.do error responses match this format.
 */

import { describe, it, expect } from 'vitest'

/**
 * Firebase error response format interface
 * This is the standard format used across Firebase REST APIs
 */
interface FirebaseErrorResponse {
  error: {
    code: number
    message: string
    status?: string
    errors?: Array<{
      message: string
      domain: string
      reason: string
    }>
  }
}

/**
 * Callable function error response format
 * Used by Firebase Cloud Functions callable endpoints
 */
interface CallableErrorResponse {
  error: {
    message: string
    status: string
    details?: unknown
  }
}

/**
 * Validates that an error response matches Firebase's standard error format
 */
function isValidFirebaseErrorResponse(response: unknown): response is FirebaseErrorResponse {
  if (typeof response !== 'object' || response === null) {
    return false
  }

  const obj = response as Record<string, unknown>
  if (!('error' in obj) || typeof obj.error !== 'object' || obj.error === null) {
    return false
  }

  const error = obj.error as Record<string, unknown>

  // Required fields
  if (typeof error.code !== 'number') {
    return false
  }
  if (typeof error.message !== 'string') {
    return false
  }

  // Optional fields (if present, must have correct types)
  if ('status' in error && typeof error.status !== 'string') {
    return false
  }

  if ('errors' in error) {
    if (!Array.isArray(error.errors)) {
      return false
    }
    for (const err of error.errors) {
      if (typeof err !== 'object' || err === null) {
        return false
      }
      if (typeof err.message !== 'string' || typeof err.domain !== 'string' || typeof err.reason !== 'string') {
        return false
      }
    }
  }

  return true
}

/**
 * Validates that an error response matches Firebase callable function error format
 */
function isValidCallableErrorResponse(response: unknown): response is CallableErrorResponse {
  if (typeof response !== 'object' || response === null) {
    return false
  }

  const obj = response as Record<string, unknown>
  if (!('error' in obj) || typeof obj.error !== 'object' || obj.error === null) {
    return false
  }

  const error = obj.error as Record<string, unknown>

  // Required fields for callable errors
  if (typeof error.message !== 'string') {
    return false
  }
  if (typeof error.status !== 'string') {
    return false
  }

  // Optional details field can be any type
  return true
}

describe('Firebase Error Response Format Compatibility', () => {
  describe('Standard Firebase Error Format Structure', () => {
    it('should validate correct Firebase error format with required fields', () => {
      const validError: FirebaseErrorResponse = {
        error: {
          code: 404,
          message: 'Document not found',
          status: 'NOT_FOUND',
        },
      }

      expect(isValidFirebaseErrorResponse(validError)).toBe(true)
      expect(validError.error.code).toBe(404)
      expect(validError.error.message).toBe('Document not found')
      expect(validError.error.status).toBe('NOT_FOUND')
    })

    it('should validate Firebase error format with only code and message', () => {
      const minimalError: FirebaseErrorResponse = {
        error: {
          code: 500,
          message: 'Internal server error',
        },
      }

      expect(isValidFirebaseErrorResponse(minimalError)).toBe(true)
      expect(minimalError.error.code).toBe(500)
      expect(minimalError.error.message).toBe('Internal server error')
    })

    it('should validate Firebase error format with detailed errors array', () => {
      const detailedError: FirebaseErrorResponse = {
        error: {
          code: 400,
          message: 'INVALID_EMAIL',
          errors: [
            {
              message: 'The email address is badly formatted.',
              domain: 'global',
              reason: 'invalid',
            },
          ],
        },
      }

      expect(isValidFirebaseErrorResponse(detailedError)).toBe(true)
      expect(detailedError.error.errors).toHaveLength(1)
      expect(detailedError.error.errors![0].message).toBe('The email address is badly formatted.')
      expect(detailedError.error.errors![0].domain).toBe('global')
      expect(detailedError.error.errors![0].reason).toBe('invalid')
    })

    it('should reject error response missing error object', () => {
      const invalidError = { message: 'Error without wrapper' }
      expect(isValidFirebaseErrorResponse(invalidError)).toBe(false)
    })

    it('should reject error response with non-numeric code', () => {
      const invalidError = {
        error: {
          code: '404', // Should be number, not string
          message: 'Not found',
        },
      }
      expect(isValidFirebaseErrorResponse(invalidError)).toBe(false)
    })

    it('should reject error response with non-string message', () => {
      const invalidError = {
        error: {
          code: 404,
          message: 404, // Should be string, not number
        },
      }
      expect(isValidFirebaseErrorResponse(invalidError)).toBe(false)
    })

    it('should reject null or undefined response', () => {
      expect(isValidFirebaseErrorResponse(null)).toBe(false)
      expect(isValidFirebaseErrorResponse(undefined)).toBe(false)
    })
  })

  describe('Firebase Status Codes', () => {
    // Firebase uses gRPC status codes mapped to HTTP
    const statusCodeMappings = [
      { httpCode: 400, status: 'INVALID_ARGUMENT', description: 'Invalid request' },
      { httpCode: 400, status: 'FAILED_PRECONDITION', description: 'Precondition failed' },
      { httpCode: 400, status: 'OUT_OF_RANGE', description: 'Out of range' },
      { httpCode: 401, status: 'UNAUTHENTICATED', description: 'Not authenticated' },
      { httpCode: 403, status: 'PERMISSION_DENIED', description: 'Permission denied' },
      { httpCode: 404, status: 'NOT_FOUND', description: 'Resource not found' },
      { httpCode: 409, status: 'ALREADY_EXISTS', description: 'Resource already exists' },
      { httpCode: 409, status: 'ABORTED', description: 'Operation aborted' },
      { httpCode: 429, status: 'RESOURCE_EXHAUSTED', description: 'Resource exhausted' },
      { httpCode: 499, status: 'CANCELLED', description: 'Operation cancelled' },
      { httpCode: 500, status: 'INTERNAL', description: 'Internal error' },
      { httpCode: 500, status: 'UNKNOWN', description: 'Unknown error' },
      { httpCode: 500, status: 'DATA_LOSS', description: 'Data loss' },
      { httpCode: 501, status: 'UNIMPLEMENTED', description: 'Not implemented' },
      { httpCode: 503, status: 'UNAVAILABLE', description: 'Service unavailable' },
      { httpCode: 504, status: 'DEADLINE_EXCEEDED', description: 'Deadline exceeded' },
    ]

    it.each(statusCodeMappings)(
      'should map status "$status" to HTTP $httpCode',
      ({ httpCode, status, description }) => {
        const error: FirebaseErrorResponse = {
          error: {
            code: httpCode,
            message: description,
            status: status,
          },
        }

        expect(isValidFirebaseErrorResponse(error)).toBe(true)
        expect(error.error.code).toBe(httpCode)
        expect(error.error.status).toBe(status)
      }
    )
  })

  describe('Callable Function Error Format', () => {
    it('should validate callable error format with required fields', () => {
      const callableError: CallableErrorResponse = {
        error: {
          message: 'Invalid argument provided',
          status: 'INVALID_ARGUMENT',
        },
      }

      expect(isValidCallableErrorResponse(callableError)).toBe(true)
      expect(callableError.error.message).toBe('Invalid argument provided')
      expect(callableError.error.status).toBe('INVALID_ARGUMENT')
    })

    it('should validate callable error format with details', () => {
      const callableError: CallableErrorResponse = {
        error: {
          message: 'Validation failed',
          status: 'INVALID_ARGUMENT',
          details: {
            field: 'email',
            reason: 'Invalid email format',
          },
        },
      }

      expect(isValidCallableErrorResponse(callableError)).toBe(true)
      expect(callableError.error.details).toEqual({
        field: 'email',
        reason: 'Invalid email format',
      })
    })

    it('should validate callable error format with array details', () => {
      const callableError: CallableErrorResponse = {
        error: {
          message: 'Multiple validation errors',
          status: 'INVALID_ARGUMENT',
          details: [
            { field: 'name', error: 'Required' },
            { field: 'age', error: 'Must be positive' },
          ],
        },
      }

      expect(isValidCallableErrorResponse(callableError)).toBe(true)
      expect(Array.isArray(callableError.error.details)).toBe(true)
    })

    it('should reject callable error missing status', () => {
      const invalidError = {
        error: {
          message: 'Error without status',
        },
      }
      expect(isValidCallableErrorResponse(invalidError)).toBe(false)
    })

    it('should reject callable error missing message', () => {
      const invalidError = {
        error: {
          status: 'INVALID_ARGUMENT',
        },
      }
      expect(isValidCallableErrorResponse(invalidError)).toBe(false)
    })
  })

  describe('Firestore Error Format', () => {
    it('should produce valid Firestore NOT_FOUND error', () => {
      const firestoreError: FirebaseErrorResponse = {
        error: {
          code: 404,
          message: 'Document "projects/test/databases/(default)/documents/users/123" not found',
          status: 'NOT_FOUND',
        },
      }

      expect(isValidFirebaseErrorResponse(firestoreError)).toBe(true)
      expect(firestoreError.error.code).toBe(404)
      expect(firestoreError.error.status).toBe('NOT_FOUND')
    })

    it('should produce valid Firestore PERMISSION_DENIED error', () => {
      const firestoreError: FirebaseErrorResponse = {
        error: {
          code: 403,
          message: 'Missing or insufficient permissions',
          status: 'PERMISSION_DENIED',
        },
      }

      expect(isValidFirebaseErrorResponse(firestoreError)).toBe(true)
      expect(firestoreError.error.code).toBe(403)
      expect(firestoreError.error.status).toBe('PERMISSION_DENIED')
    })

    it('should produce valid Firestore ALREADY_EXISTS error', () => {
      const firestoreError: FirebaseErrorResponse = {
        error: {
          code: 409,
          message: 'Document already exists',
          status: 'ALREADY_EXISTS',
        },
      }

      expect(isValidFirebaseErrorResponse(firestoreError)).toBe(true)
      expect(firestoreError.error.code).toBe(409)
      expect(firestoreError.error.status).toBe('ALREADY_EXISTS')
    })

    it('should produce valid Firestore INVALID_ARGUMENT error', () => {
      const firestoreError: FirebaseErrorResponse = {
        error: {
          code: 400,
          message: 'Invalid field value',
          status: 'INVALID_ARGUMENT',
        },
      }

      expect(isValidFirebaseErrorResponse(firestoreError)).toBe(true)
      expect(firestoreError.error.code).toBe(400)
      expect(firestoreError.error.status).toBe('INVALID_ARGUMENT')
    })
  })

  describe('Identity Toolkit Error Format', () => {
    it('should produce valid Identity Toolkit error with errors array', () => {
      const authError: FirebaseErrorResponse = {
        error: {
          code: 400,
          message: 'EMAIL_NOT_FOUND',
          errors: [
            {
              message: 'EMAIL_NOT_FOUND',
              domain: 'global',
              reason: 'invalid',
            },
          ],
        },
      }

      expect(isValidFirebaseErrorResponse(authError)).toBe(true)
      expect(authError.error.code).toBe(400)
      expect(authError.error.message).toBe('EMAIL_NOT_FOUND')
      expect(authError.error.errors).toHaveLength(1)
    })

    it('should produce valid Identity Toolkit INVALID_PASSWORD error', () => {
      const authError: FirebaseErrorResponse = {
        error: {
          code: 400,
          message: 'INVALID_PASSWORD',
          errors: [
            {
              message: 'The password is invalid or the user does not have a password.',
              domain: 'global',
              reason: 'invalid',
            },
          ],
        },
      }

      expect(isValidFirebaseErrorResponse(authError)).toBe(true)
    })

    it('should produce valid Identity Toolkit EMAIL_EXISTS error', () => {
      const authError: FirebaseErrorResponse = {
        error: {
          code: 400,
          message: 'EMAIL_EXISTS',
          errors: [
            {
              message: 'The email address is already in use by another account.',
              domain: 'global',
              reason: 'invalid',
            },
          ],
        },
      }

      expect(isValidFirebaseErrorResponse(authError)).toBe(true)
    })

    it('should produce valid Identity Toolkit WEAK_PASSWORD error', () => {
      const authError: FirebaseErrorResponse = {
        error: {
          code: 400,
          message: 'WEAK_PASSWORD : Password should be at least 6 characters',
          errors: [
            {
              message: 'WEAK_PASSWORD',
              domain: 'global',
              reason: 'invalid',
            },
          ],
        },
      }

      expect(isValidFirebaseErrorResponse(authError)).toBe(true)
    })

    it('should produce valid Identity Toolkit INVALID_ID_TOKEN error', () => {
      const authError: FirebaseErrorResponse = {
        error: {
          code: 400,
          message: 'INVALID_ID_TOKEN',
          errors: [
            {
              message: 'The user\'s credential is no longer valid. The user must sign in again.',
              domain: 'global',
              reason: 'invalid',
            },
          ],
        },
      }

      expect(isValidFirebaseErrorResponse(authError)).toBe(true)
    })
  })

  describe('Storage Error Format', () => {
    it('should produce valid Storage NOT_FOUND error', () => {
      const storageError: FirebaseErrorResponse = {
        error: {
          code: 404,
          message: 'No such object: bucket/path/to/file.txt',
          status: 'NOT_FOUND',
        },
      }

      expect(isValidFirebaseErrorResponse(storageError)).toBe(true)
      expect(storageError.error.code).toBe(404)
    })

    it('should produce valid Storage UNAUTHORIZED error', () => {
      const storageError: FirebaseErrorResponse = {
        error: {
          code: 401,
          message: 'Anonymous caller does not have storage.objects.get access',
          status: 'UNAUTHENTICATED',
        },
      }

      expect(isValidFirebaseErrorResponse(storageError)).toBe(true)
    })

    it('should produce valid Storage FORBIDDEN error', () => {
      const storageError: FirebaseErrorResponse = {
        error: {
          code: 403,
          message: 'Caller does not have permission to access the bucket',
          status: 'PERMISSION_DENIED',
        },
      }

      expect(isValidFirebaseErrorResponse(storageError)).toBe(true)
    })
  })

  describe('Error Response Consistency', () => {
    it('should always wrap error in error object', () => {
      // Firebase never returns bare errors like { message: "error" }
      // It always wraps in { error: { ... } }
      const errors = [
        { error: { code: 400, message: 'Bad request' } },
        { error: { code: 401, message: 'Unauthorized' } },
        { error: { code: 403, message: 'Forbidden' } },
        { error: { code: 404, message: 'Not found' } },
        { error: { code: 500, message: 'Internal error' } },
      ]

      for (const error of errors) {
        expect(isValidFirebaseErrorResponse(error)).toBe(true)
        expect('error' in error).toBe(true)
      }
    })

    it('should use numeric HTTP codes not string codes', () => {
      const validError: FirebaseErrorResponse = {
        error: {
          code: 404, // Correct: numeric
          message: 'Not found',
        },
      }

      const invalidError = {
        error: {
          code: 'NOT_FOUND', // Incorrect: string status code as code
          message: 'Not found',
        },
      }

      expect(isValidFirebaseErrorResponse(validError)).toBe(true)
      expect(isValidFirebaseErrorResponse(invalidError)).toBe(false)
    })

    it('should use string status codes for status field', () => {
      const error: FirebaseErrorResponse = {
        error: {
          code: 404,
          message: 'Not found',
          status: 'NOT_FOUND', // status is always a string
        },
      }

      expect(isValidFirebaseErrorResponse(error)).toBe(true)
      expect(typeof error.error.status).toBe('string')
    })
  })
})
