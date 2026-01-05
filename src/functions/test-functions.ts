/**
 * Test function implementations for callable function tests
 */

import { CallableError, type CallableContext } from './callable'

/**
 * Simple test function that returns the input data
 */
export function testFunction(data: unknown, _context: CallableContext): unknown {
  return { message: 'Success', receivedData: data }
}

/**
 * Echo function that returns the input data as-is
 */
export function echoFunction(data: unknown, _context: CallableContext): unknown {
  return data
}

/**
 * Function that demonstrates error handling
 */
export function errorFunction(data: unknown, _context: CallableContext): unknown {
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>

    // Test throwing specific error codes
    if (obj.throwError && typeof obj.throwError === 'string') {
      const errorCode = obj.throwError
      throw new CallableError(errorCode, `Test error with code ${errorCode}`)
    }

    // Test error with details
    if (obj.errorWithDetails) {
      throw new CallableError(
        'INVALID_ARGUMENT',
        'Error with additional details',
        { field: 'someField', reason: 'Invalid value' }
      )
    }

    // Test unknown error (not a CallableError)
    if (obj.throwUnknownError) {
      throw new Error('Unknown error type')
    }

    // Default error case
    if (obj.shouldFail) {
      throw new CallableError('INTERNAL', 'Function intentionally failed')
    }
  }

  return { success: true }
}

/**
 * Function that returns auth information
 */
export function authFunction(data: unknown, context: CallableContext): unknown {
  if (!context.auth) {
    throw new CallableError('UNAUTHENTICATED', 'Authentication required')
  }

  return {
    auth: context.auth,
    data,
  }
}

/**
 * Public function that doesn't require auth
 */
export function publicFunction(data: unknown, context: CallableContext): unknown {
  return {
    auth: context.auth,
    data,
  }
}

/**
 * Function that simulates a timeout
 */
export async function slowFunction(data: unknown, _context: CallableContext): Promise<unknown> {
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>
    if (obj.timeout) {
      throw new CallableError('DEADLINE_EXCEEDED', 'Function execution timed out')
    }
  }

  return { success: true }
}
