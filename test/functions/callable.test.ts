/**
 * Tests for Firebase Callable Function Protocol
 *
 * Firebase callable functions use a specific HTTP protocol:
 * - POST requests with JSON body containing { "data": {...} }
 * - Success responses return { "result": {...} }
 * - Error responses return { "error": { "message": "...", "status": "..." } }
 *
 * @see https://firebase.google.com/docs/functions/callable-reference
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { handleCallable, registerFunction, clearFunctions, type CallableRequest, type CallableResponse } from '../../src/functions/callable'
import {
  testFunction,
  echoFunction,
  errorFunction,
  authFunction,
  publicFunction,
  slowFunction,
} from '../../src/functions/test-functions'

// Helper to create a mock request
function createRequest(overrides: Partial<CallableRequest> = {}): CallableRequest {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: { data: {} },
    ...overrides,
  }
}

describe('Firebase Callable Function Protocol', () => {
  beforeAll(() => {
    // Register test functions
    registerFunction('testFunction', testFunction)
    registerFunction('echoFunction', echoFunction)
    registerFunction('errorFunction', errorFunction)
    registerFunction('authFunction', authFunction)
    registerFunction('publicFunction', publicFunction)
    registerFunction('slowFunction', slowFunction)
  })

  afterAll(() => {
    // Clean up registered functions
    clearFunctions()
  })

  describe('Request Format', () => {
    it('should accept POST request with JSON body containing { data: {...} }', async () => {
      const request = createRequest({
        body: { data: { message: 'Hello, World!' } },
      })

      const response = await handleCallable('testFunction', request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('result')
    })

    it('should reject non-POST requests with 405 Method Not Allowed', async () => {
      const request = createRequest({ method: 'GET' })

      const response = await handleCallable('testFunction', request)

      expect(response.status).toBe(405)
      expect(response.body).toEqual({
        error: {
          message: expect.stringContaining('POST'),
          status: 'INVALID_ARGUMENT',
        },
      })
    })

    it('should reject requests without data field with 400 Bad Request', async () => {
      const request = createRequest({
        body: { notData: 'invalid' },
      })

      const response = await handleCallable('testFunction', request)

      expect(response.status).toBe(400)
      expect(response.body).toEqual({
        error: {
          message: expect.stringContaining('data'),
          status: 'INVALID_ARGUMENT',
        },
      })
    })

    it('should accept null data value', async () => {
      const request = createRequest({
        body: { data: null },
      })

      const response = await handleCallable('testFunction', request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('result')
    })

    it('should accept primitive data values', async () => {
      const testCases = [
        { data: 'string value' },
        { data: 42 },
        { data: true },
        { data: [1, 2, 3] },
      ]

      for (const body of testCases) {
        const request = createRequest({ body })
        const response = await handleCallable('testFunction', request)

        expect(response.status).toBe(200)
        expect(response.body).toHaveProperty('result')
      }
    })
  })

  describe('Response Format', () => {
    it('should return { result: {...} } on success', async () => {
      const request = createRequest({
        body: { data: { input: 'test' } },
      })

      const response = await handleCallable('echoFunction', request)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        result: expect.anything(),
      })
    })

    it('should return { error: { message, status } } on function error', async () => {
      const request = createRequest({
        body: { data: { shouldFail: true } },
      })

      const response = await handleCallable('errorFunction', request)

      expect(response.body).toEqual({
        error: {
          message: expect.any(String),
          status: expect.any(String),
        },
      })
    })

    it('should include error details when provided', async () => {
      const request = createRequest({
        body: { data: { errorWithDetails: true } },
      })

      const response = await handleCallable('errorFunction', request)

      expect(response.body).toEqual({
        error: {
          message: expect.any(String),
          status: expect.any(String),
          details: expect.anything(),
        },
      })
    })
  })

  describe('Content-Type Handling', () => {
    it('should require Content-Type application/json', async () => {
      const request = createRequest({
        headers: { 'content-type': 'text/plain' },
      })

      const response = await handleCallable('testFunction', request)

      expect(response.status).toBe(415)
      expect(response.body).toEqual({
        error: {
          message: expect.stringContaining('application/json'),
          status: 'INVALID_ARGUMENT',
        },
      })
    })

    it('should accept Content-Type with charset', async () => {
      const request = createRequest({
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: { data: {} },
      })

      const response = await handleCallable('testFunction', request)

      expect(response.status).toBe(200)
    })

    it('should handle missing Content-Type header', async () => {
      const request = createRequest({
        headers: {},
        body: { data: {} },
      })

      const response = await handleCallable('testFunction', request)

      expect(response.status).toBe(415)
      expect(response.body).toEqual({
        error: {
          message: expect.stringContaining('Content-Type'),
          status: 'INVALID_ARGUMENT',
        },
      })
    })
  })

  describe('Authorization Header Parsing', () => {
    it('should parse Bearer token from Authorization header', async () => {
      const request = createRequest({
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test-token',
        },
        body: { data: {} },
      })

      const response = await handleCallable('authFunction', request)

      // The function should receive the parsed token context
      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        result: expect.objectContaining({
          auth: expect.objectContaining({
            token: expect.any(String),
          }),
        }),
      })
    })

    it('should handle requests without Authorization header', async () => {
      const request = createRequest({
        headers: {
          'content-type': 'application/json',
        },
        body: { data: {} },
      })

      const response = await handleCallable('publicFunction', request)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        result: expect.objectContaining({
          auth: null,
        }),
      })
    })

    it('should reject invalid Authorization header format', async () => {
      const request = createRequest({
        headers: {
          'content-type': 'application/json',
          authorization: 'InvalidFormat token',
        },
        body: { data: {} },
      })

      const response = await handleCallable('authFunction', request)

      expect(response.status).toBe(401)
      expect(response.body).toEqual({
        error: {
          message: expect.stringContaining('Authorization'),
          status: 'UNAUTHENTICATED',
        },
      })
    })

    it('should reject expired or invalid tokens', async () => {
      const request = createRequest({
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer invalid.token.here',
        },
        body: { data: {} },
      })

      const response = await handleCallable('authFunction', request)

      expect(response.status).toBe(401)
      expect(response.body).toEqual({
        error: {
          message: expect.any(String),
          status: 'UNAUTHENTICATED',
        },
      })
    })
  })

  describe('CORS Headers', () => {
    it('should set Access-Control-Allow-Origin header', async () => {
      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleCallable('testFunction', request)

      expect(response.headers['access-control-allow-origin']).toBeDefined()
    })

    it('should set Access-Control-Allow-Methods for preflight', async () => {
      const request: CallableRequest = {
        method: 'OPTIONS',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'POST',
        },
        body: null,
      }

      const response = await handleCallable('testFunction', request)

      expect(response.status).toBe(204)
      expect(response.headers['access-control-allow-methods']).toContain('POST')
    })

    it('should set Access-Control-Allow-Headers for preflight', async () => {
      const request: CallableRequest = {
        method: 'OPTIONS',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,authorization',
        },
        body: null,
      }

      const response = await handleCallable('testFunction', request)

      expect(response.headers['access-control-allow-headers']).toContain('content-type')
      expect(response.headers['access-control-allow-headers']).toContain('authorization')
    })

    it('should set Access-Control-Max-Age for preflight caching', async () => {
      const request: CallableRequest = {
        method: 'OPTIONS',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'POST',
        },
        body: null,
      }

      const response = await handleCallable('testFunction', request)

      expect(response.headers['access-control-max-age']).toBeDefined()
    })
  })

  describe('Firebase Error Code Mapping', () => {
    const errorCodes = [
      { code: 'INVALID_ARGUMENT', httpStatus: 400 },
      { code: 'FAILED_PRECONDITION', httpStatus: 400 },
      { code: 'OUT_OF_RANGE', httpStatus: 400 },
      { code: 'UNAUTHENTICATED', httpStatus: 401 },
      { code: 'PERMISSION_DENIED', httpStatus: 403 },
      { code: 'NOT_FOUND', httpStatus: 404 },
      { code: 'ALREADY_EXISTS', httpStatus: 409 },
      { code: 'ABORTED', httpStatus: 409 },
      { code: 'RESOURCE_EXHAUSTED', httpStatus: 429 },
      { code: 'CANCELLED', httpStatus: 499 },
      { code: 'INTERNAL', httpStatus: 500 },
      { code: 'UNKNOWN', httpStatus: 500 },
      { code: 'DATA_LOSS', httpStatus: 500 },
      { code: 'UNIMPLEMENTED', httpStatus: 501 },
      { code: 'UNAVAILABLE', httpStatus: 503 },
      { code: 'DEADLINE_EXCEEDED', httpStatus: 504 },
    ]

    it.each(errorCodes)(
      'should map $code to HTTP status $httpStatus',
      async ({ code, httpStatus }) => {
        const request = createRequest({
          body: { data: { throwError: code } },
        })

        const response = await handleCallable('errorFunction', request)

        expect(response.status).toBe(httpStatus)
        expect(response.body).toEqual({
          error: {
            message: expect.any(String),
            status: code,
          },
        })
      }
    )

    it('should default unknown errors to INTERNAL with 500 status', async () => {
      const request = createRequest({
        body: { data: { throwUnknownError: true } },
      })

      const response = await handleCallable('errorFunction', request)

      expect(response.status).toBe(500)
      expect(response.body).toEqual({
        error: {
          message: expect.any(String),
          status: 'INTERNAL',
        },
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty request body', async () => {
      const request = createRequest({
        body: null,
      })

      const response = await handleCallable('testFunction', request)

      expect(response.status).toBe(400)
      expect(response.body).toEqual({
        error: {
          message: expect.any(String),
          status: 'INVALID_ARGUMENT',
        },
      })
    })

    it('should handle malformed JSON body', async () => {
      const request = createRequest({
        body: 'not valid json' as unknown,
      })

      const response = await handleCallable('testFunction', request)

      expect(response.status).toBe(400)
      expect(response.body).toEqual({
        error: {
          message: expect.any(String),
          status: 'INVALID_ARGUMENT',
        },
      })
    })

    it('should handle function not found', async () => {
      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleCallable('nonExistentFunction', request)

      expect(response.status).toBe(404)
      expect(response.body).toEqual({
        error: {
          message: expect.stringContaining('not found'),
          status: 'NOT_FOUND',
        },
      })
    })

    it('should handle function timeout', async () => {
      const request = createRequest({
        body: { data: { timeout: true } },
      })

      const response = await handleCallable('slowFunction', request)

      expect(response.status).toBe(504)
      expect(response.body).toEqual({
        error: {
          message: expect.any(String),
          status: 'DEADLINE_EXCEEDED',
        },
      })
    })

    it('should handle large payloads within limits', async () => {
      const largeData = { items: Array(1000).fill({ value: 'x'.repeat(100) }) }
      const request = createRequest({
        body: { data: largeData },
      })

      const response = await handleCallable('testFunction', request)

      // Should either succeed or fail gracefully with appropriate error
      expect([200, 413]).toContain(response.status)
    })

    it('should reject payloads exceeding size limit', async () => {
      // Firebase has a 10MB limit for callable functions
      const hugeData = { content: 'x'.repeat(11 * 1024 * 1024) }
      const request = createRequest({
        body: { data: hugeData },
      })

      const response = await handleCallable('testFunction', request)

      expect(response.status).toBe(413)
      expect(response.body).toEqual({
        error: {
          message: expect.any(String),
          status: 'RESOURCE_EXHAUSTED',
        },
      })
    })
  })

  describe('Response Headers', () => {
    it('should set Content-Type to application/json', async () => {
      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleCallable('testFunction', request)

      expect(response.headers['content-type']).toBe('application/json')
    })

    it('should set Cache-Control to no-store', async () => {
      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleCallable('testFunction', request)

      expect(response.headers['cache-control']).toBe('no-store')
    })
  })
})
