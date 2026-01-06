/**
 * Tests for the Firebase Error Hierarchy
 */

import { describe, it, expect } from 'vitest'
import {
  FirebaseError,
  AuthError,
  FirestoreError,
  StorageError,
  FunctionsError,
  RulesError,
  ConfigError,
  ParseError,
  LexerError,
  SyntaxError,
  EvaluationError,
  RegexSecurityError,
  RegexTimeoutError,
  RulesDeploymentError,
  CallableError,
  ResumableUploadError,
  InvalidPathError,
  isFirebaseError,
  hasErrorCode,
  isErrorFromModule,
  fromJSON,
  getHttpStatus,
  ERROR_HTTP_STATUS,
  // New utilities
  wrapError,
  wrapModuleError,
  tryCatch,
  tryCatchSync,
  assertDefined,
  assertNonEmptyString,
  assertPositiveInteger,
  assertInRange,
  toHttpErrorResponse,
  toHttpResponse,
  getErrorCodeSuffix,
  getErrorModule,
  AggregateFirebaseError,
} from '../../src/errors/index.js'

describe('Firebase Error Hierarchy', () => {
  describe('FirebaseError', () => {
    it('should create error with code and message', () => {
      const error = new FirebaseError('test/error', 'Test error message')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(FirebaseError)
      expect(error.code).toBe('test/error')
      expect(error.message).toBe('Test error message')
      expect(error.name).toBe('FirebaseError')
    })

    it('should create error with details', () => {
      const error = new FirebaseError('test/error', 'Test error', {
        httpStatus: 400,
        foo: 'bar',
      })

      expect(error.details).toEqual({ httpStatus: 400, foo: 'bar' })
    })

    it('should serialize to JSON', () => {
      const error = new FirebaseError('test/error', 'Test error', {
        httpStatus: 400,
      })
      const json = error.toJSON()

      expect(json).toEqual({
        code: 'test/error',
        message: 'Test error',
        details: { httpStatus: 400 },
      })
    })

    it('should convert to string correctly', () => {
      const error = new FirebaseError('test/error', 'Test error')
      expect(error.toString()).toBe('FirebaseError [test/error]: Test error')
    })
  })

  describe('Module-specific errors', () => {
    it('AuthError should have correct code prefix', () => {
      const error = new AuthError('invalid-token', 'Invalid token')
      expect(error.code).toBe('auth/invalid-token')
      expect(error.name).toBe('AuthError')
      expect(error).toBeInstanceOf(FirebaseError)
    })

    it('FirestoreError should have correct code prefix', () => {
      const error = new FirestoreError('not-found', 'Document not found')
      expect(error.code).toBe('firestore/not-found')
      expect(error.name).toBe('FirestoreError')
      expect(error).toBeInstanceOf(FirebaseError)
    })

    it('StorageError should have correct code prefix', () => {
      const error = new StorageError('object-not-found', 'Object not found')
      expect(error.code).toBe('storage/object-not-found')
      expect(error.name).toBe('StorageError')
      expect(error).toBeInstanceOf(FirebaseError)
    })

    it('FunctionsError should have correct code prefix', () => {
      const error = new FunctionsError('not-found', 'Function not found')
      expect(error.code).toBe('functions/not-found')
      expect(error.name).toBe('FunctionsError')
      expect(error).toBeInstanceOf(FirebaseError)
    })

    it('RulesError should have correct code prefix', () => {
      const error = new RulesError('parse-error', 'Parse error')
      expect(error.code).toBe('rules/parse-error')
      expect(error.name).toBe('RulesError')
      expect(error).toBeInstanceOf(FirebaseError)
    })

    it('ConfigError should have correct code prefix', () => {
      const error = new ConfigError('invalid-project-id', 'Invalid project ID')
      expect(error.code).toBe('config/invalid-project-id')
      expect(error.name).toBe('ConfigError')
      expect(error).toBeInstanceOf(FirebaseError)
    })
  })

  describe('Specialized errors', () => {
    it('ParseError should have line and column info', () => {
      const error = new ParseError('Unexpected token', 5, 10, 50, 'source code')

      expect(error.code).toBe('rules/parse-error')
      expect(error.line).toBe(5)
      expect(error.column).toBe(10)
      expect(error.offset).toBe(50)
      expect(error.source).toBe('source code')
      expect(error.message).toContain('line 5')
      expect(error.message).toContain('column 10')
    })

    it('LexerError should extend ParseError', () => {
      const error = new LexerError('Invalid character', 1, 1, 0)
      expect(error).toBeInstanceOf(ParseError)
      expect(error.code).toBe('rules/lexer-error')
      expect(error.name).toBe('LexerError')
    })

    it('SyntaxError should extend ParseError', () => {
      const error = new SyntaxError('Expected semicolon', 3, 5, 30, 'for')
      expect(error).toBeInstanceOf(ParseError)
      expect(error.code).toBe('rules/syntax-error')
      expect(error.name).toBe('SyntaxError')
      expect(error.token).toBe('for')
    })

    it('EvaluationError should have expression info', () => {
      const error = new EvaluationError('Division by zero', 'a / 0')
      expect(error.code).toBe('rules/evaluation-error')
      expect(error.expression).toBe('a / 0')
    })

    it('RegexSecurityError should have pattern info', () => {
      const error = new RegexSecurityError('ReDoS vulnerability', '(a+)+$')
      expect(error.code).toBe('rules/regex-security-error')
      expect(error.pattern).toBe('(a+)+$')
    })

    it('RegexTimeoutError should have pattern info', () => {
      const error = new RegexTimeoutError('Regex timed out', '.*.*')
      expect(error.code).toBe('rules/regex-timeout')
      expect(error.pattern).toBe('.*.*')
    })

    it('RulesDeploymentError should have source info', () => {
      const error = new RulesDeploymentError('Deployment failed', 'rules source')
      expect(error.code).toBe('rules/deployment-error')
      expect(error.source).toBe('rules source')
    })

    it('CallableError should map legacy codes', () => {
      const error = new CallableError('INVALID_ARGUMENT', 'Bad argument', { field: 'name' })
      expect(error.code).toBe('functions/invalid-argument')
      expect(error.details?.originalCode).toBe('INVALID_ARGUMENT')
      expect(error.details?.callableDetails).toEqual({ field: 'name' })
    })

    it('ResumableUploadError should have uploadId', () => {
      const error = new ResumableUploadError('Upload failed', 'upload-123')
      expect(error.code).toBe('storage/upload-failed')
      expect(error.uploadId).toBe('upload-123')
    })

    it('InvalidPathError should have path', () => {
      const error = new InvalidPathError('Invalid path', '/bad/path')
      expect(error.code).toBe('storage/invalid-path')
      expect(error.path).toBe('/bad/path')
    })
  })

  describe('Utility functions', () => {
    it('isFirebaseError should detect FirebaseError', () => {
      const firebaseError = new FirebaseError('test/error', 'Test')
      const regularError = new Error('Test')

      expect(isFirebaseError(firebaseError)).toBe(true)
      expect(isFirebaseError(regularError)).toBe(false)
      expect(isFirebaseError(null)).toBe(false)
      expect(isFirebaseError('string')).toBe(false)
    })

    it('hasErrorCode should check error code', () => {
      const error = new AuthError('invalid-token', 'Test')

      expect(hasErrorCode(error, 'auth/invalid-token')).toBe(true)
      expect(hasErrorCode(error, 'auth/other')).toBe(false)
      expect(hasErrorCode(new Error('test'), 'auth/invalid-token')).toBe(false)
    })

    it('isErrorFromModule should check module prefix', () => {
      const authError = new AuthError('invalid-token', 'Test')
      const firestoreError = new FirestoreError('not-found', 'Test')

      expect(isErrorFromModule(authError, 'auth')).toBe(true)
      expect(isErrorFromModule(authError, 'firestore')).toBe(false)
      expect(isErrorFromModule(firestoreError, 'firestore')).toBe(true)
    })

    it('fromJSON should reconstruct errors', () => {
      const original = new AuthError('invalid-token', 'Test', { foo: 'bar' })
      const json = original.toJSON()
      const reconstructed = fromJSON(json)

      expect(reconstructed).toBeInstanceOf(AuthError)
      expect(reconstructed.code).toBe(original.code)
      expect(reconstructed.message).toBe(original.message)
      expect(reconstructed.details).toEqual(original.details)
    })

    it('getHttpStatus should return correct status', () => {
      const error400 = new FirebaseError('test/invalid-argument', 'Test')
      const error401 = new FirebaseError('test/unauthenticated', 'Test')
      const error404 = new FirebaseError('test/not-found', 'Test')
      const error500 = new FirebaseError('test/internal', 'Test')
      const errorWithExplicit = new FirebaseError('test/error', 'Test', { httpStatus: 418 })

      expect(getHttpStatus(error400)).toBe(400)
      expect(getHttpStatus(error401)).toBe(401)
      expect(getHttpStatus(error404)).toBe(404)
      expect(getHttpStatus(error500)).toBe(500)
      expect(getHttpStatus(errorWithExplicit)).toBe(418)
    })

    it('ERROR_HTTP_STATUS should have all common error codes', () => {
      expect(ERROR_HTTP_STATUS['invalid-argument']).toBe(400)
      expect(ERROR_HTTP_STATUS['unauthenticated']).toBe(401)
      expect(ERROR_HTTP_STATUS['permission-denied']).toBe(403)
      expect(ERROR_HTTP_STATUS['not-found']).toBe(404)
      expect(ERROR_HTTP_STATUS['internal']).toBe(500)
    })
  })

  describe('Error inheritance', () => {
    it('all module errors should be catchable as FirebaseError', () => {
      const errors = [
        new AuthError('invalid-token', 'Test'),
        new FirestoreError('not-found', 'Test'),
        new StorageError('object-not-found', 'Test'),
        new FunctionsError('cancelled', 'Test'),
        new RulesError('parse-error', 'Test'),
        new ConfigError('invalid-project-id', 'Test'),
      ]

      for (const error of errors) {
        expect(error).toBeInstanceOf(FirebaseError)
        expect(error).toBeInstanceOf(Error)
      }
    })

    it('specialized errors should be catchable as their parent types', () => {
      const parseError = new ParseError('Test', 1, 1, 0)
      const lexerError = new LexerError('Test', 1, 1, 0)
      const evalError = new EvaluationError('Test')

      expect(parseError).toBeInstanceOf(RulesError)
      expect(parseError).toBeInstanceOf(FirebaseError)

      expect(lexerError).toBeInstanceOf(ParseError)
      expect(lexerError).toBeInstanceOf(RulesError)
      expect(lexerError).toBeInstanceOf(FirebaseError)

      expect(evalError).toBeInstanceOf(RulesError)
      expect(evalError).toBeInstanceOf(FirebaseError)
    })
  })

  describe('Stack traces', () => {
    it('should have proper stack trace', () => {
      const error = new FirebaseError('test/error', 'Test error')
      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('FirebaseError')
    })
  })

  describe('Error wrapping utilities', () => {
    describe('wrapError', () => {
      it('should return FirebaseError as-is', () => {
        const original = new FirebaseError('test/error', 'Test')
        const wrapped = wrapError(original, 'other/code')
        expect(wrapped).toBe(original)
      })

      it('should wrap standard Error', () => {
        const original = new Error('Original message')
        const wrapped = wrapError(original, 'test/wrapped')
        expect(wrapped).toBeInstanceOf(FirebaseError)
        expect(wrapped.code).toBe('test/wrapped')
        expect(wrapped.message).toBe('Original message')
        expect(wrapped.details?.cause).toBe(original)
      })

      it('should wrap string error', () => {
        const wrapped = wrapError('String error', 'test/string')
        expect(wrapped).toBeInstanceOf(FirebaseError)
        expect(wrapped.code).toBe('test/string')
        expect(wrapped.message).toBe('String error')
      })

      it('should wrap object with message property', () => {
        const wrapped = wrapError({ message: 'Object message' }, 'test/object')
        expect(wrapped).toBeInstanceOf(FirebaseError)
        expect(wrapped.message).toBe('Object message')
      })

      it('should use default message when provided', () => {
        const wrapped = wrapError(new Error('Original'), 'test/code', 'Custom message')
        expect(wrapped.message).toBe('Custom message')
      })

      it('should handle unknown types', () => {
        const wrapped = wrapError(42, 'test/unknown')
        expect(wrapped).toBeInstanceOf(FirebaseError)
        expect(wrapped.message).toBe('42')
      })
    })

    describe('wrapModuleError', () => {
      it('should create AuthError', () => {
        const error = wrapModuleError(new Error('Test'), 'auth', 'invalid-token')
        expect(error).toBeInstanceOf(AuthError)
        expect(error.code).toBe('auth/invalid-token')
      })

      it('should create FirestoreError', () => {
        const error = wrapModuleError(new Error('Test'), 'firestore', 'not-found')
        expect(error).toBeInstanceOf(FirestoreError)
        expect(error.code).toBe('firestore/not-found')
      })

      it('should create StorageError', () => {
        const error = wrapModuleError(new Error('Test'), 'storage', 'object-not-found')
        expect(error).toBeInstanceOf(StorageError)
        expect(error.code).toBe('storage/object-not-found')
      })

      it('should create FunctionsError', () => {
        const error = wrapModuleError(new Error('Test'), 'functions', 'cancelled')
        expect(error).toBeInstanceOf(FunctionsError)
        expect(error.code).toBe('functions/cancelled')
      })

      it('should create RulesError', () => {
        const error = wrapModuleError(new Error('Test'), 'rules', 'parse-error')
        expect(error).toBeInstanceOf(RulesError)
        expect(error.code).toBe('rules/parse-error')
      })

      it('should create ConfigError', () => {
        const error = wrapModuleError(new Error('Test'), 'config', 'invalid-project-id')
        expect(error).toBeInstanceOf(ConfigError)
        expect(error.code).toBe('config/invalid-project-id')
      })

      it('should preserve cause', () => {
        const original = new Error('Original')
        const error = wrapModuleError(original, 'auth', 'internal')
        expect(error.details?.cause).toBe(original)
      })
    })
  })

  describe('Async error handling', () => {
    describe('tryCatch', () => {
      it('should return success result on success', async () => {
        const result = await tryCatch(async () => 'success')
        expect(result.success).toBe(true)
        expect(result.data).toBe('success')
        expect(result.error).toBeUndefined()
      })

      it('should return error result on failure', async () => {
        const result = await tryCatch(async () => {
          throw new Error('Failed')
        }, 'test/async')
        expect(result.success).toBe(false)
        expect(result.error).toBeInstanceOf(FirebaseError)
        expect(result.error?.code).toBe('test/async')
        expect(result.data).toBeUndefined()
      })

      it('should preserve FirebaseError', async () => {
        const original = new AuthError('invalid-token', 'Test')
        const result = await tryCatch(async () => {
          throw original
        })
        expect(result.success).toBe(false)
        expect(result.error).toBe(original)
      })
    })

    describe('tryCatchSync', () => {
      it('should return success result on success', () => {
        const result = tryCatchSync(() => 'success')
        expect(result.success).toBe(true)
        expect(result.data).toBe('success')
      })

      it('should return error result on failure', () => {
        const result = tryCatchSync(() => {
          throw new Error('Failed')
        }, 'test/sync')
        expect(result.success).toBe(false)
        expect(result.error?.code).toBe('test/sync')
      })
    })
  })

  describe('Validation utilities', () => {
    describe('assertDefined', () => {
      it('should pass for defined values', () => {
        expect(() => assertDefined('value', 'field', 'test')).not.toThrow()
        expect(() => assertDefined(0, 'field', 'test')).not.toThrow()
        expect(() => assertDefined(false, 'field', 'test')).not.toThrow()
        expect(() => assertDefined({}, 'field', 'test')).not.toThrow()
      })

      it('should throw for null', () => {
        expect(() => assertDefined(null, 'field', 'test')).toThrow(FirebaseError)
      })

      it('should throw for undefined', () => {
        expect(() => assertDefined(undefined, 'field', 'test')).toThrow(FirebaseError)
      })

      it('should include field name in error', () => {
        try {
          assertDefined(null, 'myField', 'test')
        } catch (e) {
          expect((e as FirebaseError).message).toContain('myField')
        }
      })
    })

    describe('assertNonEmptyString', () => {
      it('should pass for non-empty strings', () => {
        expect(() => assertNonEmptyString('hello', 'field', 'test')).not.toThrow()
      })

      it('should throw for empty strings', () => {
        expect(() => assertNonEmptyString('', 'field', 'test')).toThrow(FirebaseError)
      })

      it('should throw for whitespace-only strings', () => {
        expect(() => assertNonEmptyString('   ', 'field', 'test')).toThrow(FirebaseError)
      })

      it('should throw for non-strings', () => {
        expect(() => assertNonEmptyString(123, 'field', 'test')).toThrow(FirebaseError)
      })

      it('should throw for null', () => {
        expect(() => assertNonEmptyString(null, 'field', 'test')).toThrow(FirebaseError)
      })
    })

    describe('assertPositiveInteger', () => {
      it('should pass for positive integers', () => {
        expect(() => assertPositiveInteger(1, 'field', 'test')).not.toThrow()
        expect(() => assertPositiveInteger(100, 'field', 'test')).not.toThrow()
      })

      it('should throw for zero', () => {
        expect(() => assertPositiveInteger(0, 'field', 'test')).toThrow(FirebaseError)
      })

      it('should throw for negative numbers', () => {
        expect(() => assertPositiveInteger(-1, 'field', 'test')).toThrow(FirebaseError)
      })

      it('should throw for non-integers', () => {
        expect(() => assertPositiveInteger(1.5, 'field', 'test')).toThrow(FirebaseError)
      })

      it('should throw for NaN', () => {
        expect(() => assertPositiveInteger(NaN, 'field', 'test')).toThrow(FirebaseError)
      })

      it('should throw for Infinity', () => {
        expect(() => assertPositiveInteger(Infinity, 'field', 'test')).toThrow(FirebaseError)
      })
    })

    describe('assertInRange', () => {
      it('should pass for values within range', () => {
        expect(() => assertInRange(5, 0, 10, 'field', 'test')).not.toThrow()
        expect(() => assertInRange(0, 0, 10, 'field', 'test')).not.toThrow()
        expect(() => assertInRange(10, 0, 10, 'field', 'test')).not.toThrow()
      })

      it('should throw for values below range', () => {
        expect(() => assertInRange(-1, 0, 10, 'field', 'test')).toThrow(FirebaseError)
      })

      it('should throw for values above range', () => {
        expect(() => assertInRange(11, 0, 10, 'field', 'test')).toThrow(FirebaseError)
      })
    })
  })

  describe('HTTP response utilities', () => {
    describe('toHttpErrorResponse', () => {
      it('should convert error to HTTP response format', () => {
        const error = new AuthError('unauthenticated', 'Not authenticated')
        const response = toHttpErrorResponse(error)

        expect(response.error.code).toBe(401)
        expect(response.error.message).toBe('Not authenticated')
        expect(response.error.status).toBe('auth/unauthenticated')
      })

      it('should include details when present', () => {
        const error = new FirebaseError('test/error', 'Test', { foo: 'bar' })
        const response = toHttpErrorResponse(error)

        expect(response.error.details).toEqual({ foo: 'bar' })
      })
    })

    describe('toHttpResponse', () => {
      it('should create Response object', () => {
        const error = new AuthError('not-found', 'User not found')
        const response = toHttpResponse(error)

        expect(response).toBeInstanceOf(Response)
        expect(response.status).toBe(404)
        expect(response.headers.get('Content-Type')).toBe('application/json')
      })
    })

    describe('getErrorCodeSuffix', () => {
      it('should extract code suffix', () => {
        const error = new AuthError('invalid-token', 'Test')
        expect(getErrorCodeSuffix(error)).toBe('invalid-token')
      })

      it('should handle code without prefix', () => {
        const error = new FirebaseError('simple-code', 'Test')
        expect(getErrorCodeSuffix(error)).toBe('simple-code')
      })
    })

    describe('getErrorModule', () => {
      it('should extract module prefix', () => {
        const error = new AuthError('invalid-token', 'Test')
        expect(getErrorModule(error)).toBe('auth')
      })

      it('should return unknown for code without prefix', () => {
        const error = new FirebaseError('simple-code', 'Test')
        expect(getErrorModule(error)).toBe('unknown')
      })
    })
  })

  describe('Error aggregation', () => {
    describe('AggregateFirebaseError', () => {
      it('should aggregate multiple errors', () => {
        const errors = [
          new AuthError('invalid-token', 'Token error'),
          new FirestoreError('not-found', 'Doc not found'),
        ]
        const aggregate = new AggregateFirebaseError(errors)

        expect(aggregate).toBeInstanceOf(FirebaseError)
        expect(aggregate.errors).toHaveLength(2)
        expect(aggregate.code).toBe('aggregate/multiple-errors')
        expect(aggregate.message).toContain('Token error')
        expect(aggregate.message).toContain('Doc not found')
      })

      it('should allow custom message', () => {
        const aggregate = new AggregateFirebaseError(
          [new AuthError('internal', 'Error')],
          'Custom aggregate message'
        )
        expect(aggregate.message).toBe('Custom aggregate message')
      })

      it('getCodes should return all error codes', () => {
        const aggregate = new AggregateFirebaseError([
          new AuthError('invalid-token', 'Test'),
          new FirestoreError('not-found', 'Test'),
        ])
        const codes = aggregate.getCodes()

        expect(codes).toContain('auth/invalid-token')
        expect(codes).toContain('firestore/not-found')
      })

      it('hasCode should check for specific code', () => {
        const aggregate = new AggregateFirebaseError([
          new AuthError('invalid-token', 'Test'),
          new FirestoreError('not-found', 'Test'),
        ])

        expect(aggregate.hasCode('auth/invalid-token')).toBe(true)
        expect(aggregate.hasCode('storage/object-not-found')).toBe(false)
      })
    })
  })

  describe('Typed error class verification', () => {
    describe('Error class type checking', () => {
      it('all module error classes should extend FirebaseError', () => {
        // Verify inheritance chain for all module error classes
        const authError = new AuthError('invalid-token', 'Test')
        const firestoreError = new FirestoreError('not-found', 'Test')
        const storageError = new StorageError('object-not-found', 'Test')
        const functionsError = new FunctionsError('cancelled', 'Test')
        const rulesError = new RulesError('parse-error', 'Test')
        const configError = new ConfigError('invalid-project-id', 'Test')

        // All should be FirebaseError instances
        expect(authError).toBeInstanceOf(FirebaseError)
        expect(firestoreError).toBeInstanceOf(FirebaseError)
        expect(storageError).toBeInstanceOf(FirebaseError)
        expect(functionsError).toBeInstanceOf(FirebaseError)
        expect(rulesError).toBeInstanceOf(FirebaseError)
        expect(configError).toBeInstanceOf(FirebaseError)

        // All should be Error instances
        expect(authError).toBeInstanceOf(Error)
        expect(firestoreError).toBeInstanceOf(Error)
        expect(storageError).toBeInstanceOf(Error)
        expect(functionsError).toBeInstanceOf(Error)
        expect(rulesError).toBeInstanceOf(Error)
        expect(configError).toBeInstanceOf(Error)
      })

      it('specialized error classes should extend their parent module errors', () => {
        const parseError = new ParseError('Test', 1, 1, 0)
        const lexerError = new LexerError('Test', 1, 1, 0)
        const syntaxError = new SyntaxError('Test', 1, 1, 0)
        const evaluationError = new EvaluationError('Test')
        const regexSecurityError = new RegexSecurityError('Test')
        const regexTimeoutError = new RegexTimeoutError('Test')
        const rulesDeploymentError = new RulesDeploymentError('Test')
        const callableError = new CallableError('INTERNAL', 'Test')
        const resumableUploadError = new ResumableUploadError('Test')
        const invalidPathError = new InvalidPathError('Test')

        // Rules errors should extend RulesError
        expect(parseError).toBeInstanceOf(RulesError)
        expect(lexerError).toBeInstanceOf(ParseError)
        expect(lexerError).toBeInstanceOf(RulesError)
        expect(syntaxError).toBeInstanceOf(ParseError)
        expect(syntaxError).toBeInstanceOf(RulesError)
        expect(evaluationError).toBeInstanceOf(RulesError)
        expect(regexSecurityError).toBeInstanceOf(RulesError)
        expect(regexTimeoutError).toBeInstanceOf(RulesError)
        expect(rulesDeploymentError).toBeInstanceOf(RulesError)

        // Functions errors should extend FunctionsError
        expect(callableError).toBeInstanceOf(FunctionsError)

        // Storage errors should extend StorageError
        expect(resumableUploadError).toBeInstanceOf(StorageError)
        expect(invalidPathError).toBeInstanceOf(StorageError)

        // All should ultimately be FirebaseError
        expect(parseError).toBeInstanceOf(FirebaseError)
        expect(lexerError).toBeInstanceOf(FirebaseError)
        expect(syntaxError).toBeInstanceOf(FirebaseError)
        expect(evaluationError).toBeInstanceOf(FirebaseError)
        expect(regexSecurityError).toBeInstanceOf(FirebaseError)
        expect(regexTimeoutError).toBeInstanceOf(FirebaseError)
        expect(rulesDeploymentError).toBeInstanceOf(FirebaseError)
        expect(callableError).toBeInstanceOf(FirebaseError)
        expect(resumableUploadError).toBeInstanceOf(FirebaseError)
        expect(invalidPathError).toBeInstanceOf(FirebaseError)
      })

      it('AggregateFirebaseError should extend FirebaseError', () => {
        const aggregate = new AggregateFirebaseError([
          new AuthError('invalid-token', 'Test'),
        ])
        expect(aggregate).toBeInstanceOf(FirebaseError)
        expect(aggregate).toBeInstanceOf(Error)
      })
    })

    describe('Error code format verification', () => {
      it('all module errors should have properly formatted codes', () => {
        const testCases = [
          { error: new AuthError('invalid-token', 'Test'), expectedPrefix: 'auth/' },
          { error: new FirestoreError('not-found', 'Test'), expectedPrefix: 'firestore/' },
          { error: new StorageError('object-not-found', 'Test'), expectedPrefix: 'storage/' },
          { error: new FunctionsError('cancelled', 'Test'), expectedPrefix: 'functions/' },
          { error: new RulesError('parse-error', 'Test'), expectedPrefix: 'rules/' },
          { error: new ConfigError('invalid-project-id', 'Test'), expectedPrefix: 'config/' },
        ]

        for (const { error, expectedPrefix } of testCases) {
          expect(error.code).toMatch(new RegExp(`^${expectedPrefix}`))
          // Verify code format: module/code-name
          expect(error.code).toMatch(/^[a-z]+\/[a-z-]+$/)
        }
      })

      it('specialized errors should have specific error codes', () => {
        expect(new ParseError('Test', 1, 1, 0).code).toBe('rules/parse-error')
        expect(new LexerError('Test', 1, 1, 0).code).toBe('rules/lexer-error')
        expect(new SyntaxError('Test', 1, 1, 0).code).toBe('rules/syntax-error')
        expect(new EvaluationError('Test').code).toBe('rules/evaluation-error')
        expect(new RegexSecurityError('Test').code).toBe('rules/regex-security-error')
        expect(new RegexTimeoutError('Test').code).toBe('rules/regex-timeout')
        expect(new RulesDeploymentError('Test').code).toBe('rules/deployment-error')
        expect(new ResumableUploadError('Test').code).toBe('storage/upload-failed')
        expect(new InvalidPathError('Test').code).toBe('storage/invalid-path')
      })

      it('CallableError should map legacy codes to proper format', () => {
        const legacyCodes = [
          { legacy: 'INVALID_ARGUMENT', expected: 'functions/invalid-argument' },
          { legacy: 'NOT_FOUND', expected: 'functions/not-found' },
          { legacy: 'UNAUTHENTICATED', expected: 'functions/unauthenticated' },
          { legacy: 'PERMISSION_DENIED', expected: 'functions/permission-denied' },
          { legacy: 'INTERNAL', expected: 'functions/internal' },
          { legacy: 'CANCELLED', expected: 'functions/cancelled' },
          { legacy: 'UNKNOWN', expected: 'functions/unknown' },
        ]

        for (const { legacy, expected } of legacyCodes) {
          const error = new CallableError(legacy, 'Test')
          expect(error.code).toBe(expected)
          expect(error.details?.originalCode).toBe(legacy)
        }
      })
    })

    describe('Error name verification', () => {
      it('all errors should have correct name property', () => {
        expect(new FirebaseError('test/error', 'Test').name).toBe('FirebaseError')
        expect(new AuthError('invalid-token', 'Test').name).toBe('AuthError')
        expect(new FirestoreError('not-found', 'Test').name).toBe('FirestoreError')
        expect(new StorageError('object-not-found', 'Test').name).toBe('StorageError')
        expect(new FunctionsError('cancelled', 'Test').name).toBe('FunctionsError')
        expect(new RulesError('parse-error', 'Test').name).toBe('RulesError')
        expect(new ConfigError('invalid-project-id', 'Test').name).toBe('ConfigError')
        expect(new ParseError('Test', 1, 1, 0).name).toBe('ParseError')
        expect(new LexerError('Test', 1, 1, 0).name).toBe('LexerError')
        expect(new SyntaxError('Test', 1, 1, 0).name).toBe('SyntaxError')
        expect(new EvaluationError('Test').name).toBe('EvaluationError')
        expect(new RegexSecurityError('Test').name).toBe('RegexSecurityError')
        expect(new RegexTimeoutError('Test').name).toBe('RegexTimeoutError')
        expect(new RulesDeploymentError('Test').name).toBe('RulesDeploymentError')
        expect(new CallableError('INTERNAL', 'Test').name).toBe('CallableError')
        expect(new ResumableUploadError('Test').name).toBe('ResumableUploadError')
        expect(new InvalidPathError('Test').name).toBe('InvalidPathError')
        expect(new AggregateFirebaseError([]).name).toBe('AggregateFirebaseError')
      })
    })

    describe('Type guard functions', () => {
      it('isFirebaseError should correctly identify all typed errors', () => {
        const errors = [
          new FirebaseError('test/error', 'Test'),
          new AuthError('invalid-token', 'Test'),
          new FirestoreError('not-found', 'Test'),
          new StorageError('object-not-found', 'Test'),
          new FunctionsError('cancelled', 'Test'),
          new RulesError('parse-error', 'Test'),
          new ConfigError('invalid-project-id', 'Test'),
          new ParseError('Test', 1, 1, 0),
          new LexerError('Test', 1, 1, 0),
          new EvaluationError('Test'),
          new CallableError('INTERNAL', 'Test'),
          new ResumableUploadError('Test'),
          new InvalidPathError('Test'),
          new AggregateFirebaseError([]),
        ]

        for (const error of errors) {
          expect(isFirebaseError(error)).toBe(true)
        }
      })

      it('isFirebaseError should return false for non-Firebase errors', () => {
        expect(isFirebaseError(new Error('Plain error'))).toBe(false)
        expect(isFirebaseError(new TypeError('Type error'))).toBe(false)
        expect(isFirebaseError(new RangeError('Range error'))).toBe(false)
        expect(isFirebaseError({ code: 'fake/error', message: 'Fake' })).toBe(false)
        expect(isFirebaseError(null)).toBe(false)
        expect(isFirebaseError(undefined)).toBe(false)
        expect(isFirebaseError('string error')).toBe(false)
        expect(isFirebaseError(123)).toBe(false)
      })

      it('isErrorFromModule should correctly identify module for all typed errors', () => {
        expect(isErrorFromModule(new AuthError('invalid-token', 'Test'), 'auth')).toBe(true)
        expect(isErrorFromModule(new FirestoreError('not-found', 'Test'), 'firestore')).toBe(true)
        expect(isErrorFromModule(new StorageError('object-not-found', 'Test'), 'storage')).toBe(true)
        expect(isErrorFromModule(new FunctionsError('cancelled', 'Test'), 'functions')).toBe(true)
        expect(isErrorFromModule(new RulesError('parse-error', 'Test'), 'rules')).toBe(true)
        expect(isErrorFromModule(new ConfigError('invalid-project-id', 'Test'), 'config')).toBe(true)

        // Specialized errors should belong to their parent module
        expect(isErrorFromModule(new ParseError('Test', 1, 1, 0), 'rules')).toBe(true)
        expect(isErrorFromModule(new LexerError('Test', 1, 1, 0), 'rules')).toBe(true)
        expect(isErrorFromModule(new EvaluationError('Test'), 'rules')).toBe(true)
        expect(isErrorFromModule(new CallableError('INTERNAL', 'Test'), 'functions')).toBe(true)
        expect(isErrorFromModule(new ResumableUploadError('Test'), 'storage')).toBe(true)
        expect(isErrorFromModule(new InvalidPathError('Test'), 'storage')).toBe(true)
      })

      it('hasErrorCode should work with all typed errors', () => {
        expect(hasErrorCode(new AuthError('invalid-token', 'Test'), 'auth/invalid-token')).toBe(true)
        expect(hasErrorCode(new FirestoreError('not-found', 'Test'), 'firestore/not-found')).toBe(true)
        expect(hasErrorCode(new StorageError('object-not-found', 'Test'), 'storage/object-not-found')).toBe(true)
        expect(hasErrorCode(new ParseError('Test', 1, 1, 0), 'rules/parse-error')).toBe(true)
        expect(hasErrorCode(new LexerError('Test', 1, 1, 0), 'rules/lexer-error')).toBe(true)
        expect(hasErrorCode(new CallableError('INTERNAL', 'Test'), 'functions/internal')).toBe(true)
      })
    })

    describe('Error serialization and deserialization', () => {
      it('all module errors should serialize to JSON correctly', () => {
        const errors = [
          new AuthError('invalid-token', 'Auth test', { userId: '123' }),
          new FirestoreError('not-found', 'Firestore test', { path: '/docs/1' }),
          new StorageError('object-not-found', 'Storage test', { bucket: 'test' }),
          new FunctionsError('cancelled', 'Functions test'),
          new RulesError('parse-error', 'Rules test'),
          new ConfigError('invalid-project-id', 'Config test'),
        ]

        for (const error of errors) {
          const json = error.toJSON()
          expect(json).toHaveProperty('code')
          expect(json).toHaveProperty('message')
          expect(json.code).toBe(error.code)
          expect(json.message).toBe(error.message)
        }
      })

      it('fromJSON should reconstruct all module error types', () => {
        const testCases = [
          { code: 'auth/invalid-token', message: 'Test', expectedClass: AuthError },
          { code: 'firestore/not-found', message: 'Test', expectedClass: FirestoreError },
          { code: 'storage/object-not-found', message: 'Test', expectedClass: StorageError },
          { code: 'functions/cancelled', message: 'Test', expectedClass: FunctionsError },
          { code: 'rules/parse-error', message: 'Test', expectedClass: RulesError },
          { code: 'config/invalid-project-id', message: 'Test', expectedClass: ConfigError },
        ]

        for (const { code, message, expectedClass } of testCases) {
          const reconstructed = fromJSON({ code, message })
          expect(reconstructed).toBeInstanceOf(expectedClass)
          expect(reconstructed).toBeInstanceOf(FirebaseError)
          expect(reconstructed.code).toBe(code)
          expect(reconstructed.message).toBe(message)
        }
      })

      it('fromJSON should handle unknown module codes', () => {
        const reconstructed = fromJSON({ code: 'unknown-module/error', message: 'Test' })
        expect(reconstructed).toBeInstanceOf(FirebaseError)
        expect(reconstructed.code).toBe('unknown-module/error')
      })
    })

    describe('Error wrapping with module utilities', () => {
      it('wrapModuleError should create correct typed errors', () => {
        const modules = ['auth', 'firestore', 'storage', 'functions', 'rules', 'config'] as const
        const expectedClasses = [AuthError, FirestoreError, StorageError, FunctionsError, RulesError, ConfigError]

        modules.forEach((module, index) => {
          const wrapped = wrapModuleError(new Error('Test'), module, 'internal')
          expect(wrapped).toBeInstanceOf(expectedClasses[index])
          expect(wrapped).toBeInstanceOf(FirebaseError)
          expect(wrapped.code).toBe(`${module}/internal`)
        })
      })

      it('wrapError should preserve FirebaseError subclasses', () => {
        const authError = new AuthError('invalid-token', 'Test')
        const firestoreError = new FirestoreError('not-found', 'Test')
        const storageError = new StorageError('object-not-found', 'Test')

        expect(wrapError(authError, 'other/code')).toBe(authError)
        expect(wrapError(firestoreError, 'other/code')).toBe(firestoreError)
        expect(wrapError(storageError, 'other/code')).toBe(storageError)
      })
    })

    describe('HTTP status mapping for typed errors', () => {
      it('getHttpStatus should return correct status for all common error codes', () => {
        const commonCodes: Array<{ code: string; expectedStatus: number }> = [
          { code: 'invalid-argument', expectedStatus: 400 },
          { code: 'failed-precondition', expectedStatus: 400 },
          { code: 'out-of-range', expectedStatus: 400 },
          { code: 'unauthenticated', expectedStatus: 401 },
          { code: 'permission-denied', expectedStatus: 403 },
          { code: 'not-found', expectedStatus: 404 },
          { code: 'already-exists', expectedStatus: 409 },
          { code: 'aborted', expectedStatus: 409 },
          { code: 'resource-exhausted', expectedStatus: 429 },
          { code: 'cancelled', expectedStatus: 499 },
          { code: 'internal', expectedStatus: 500 },
          { code: 'unknown', expectedStatus: 500 },
          { code: 'data-loss', expectedStatus: 500 },
          { code: 'unimplemented', expectedStatus: 501 },
          { code: 'unavailable', expectedStatus: 503 },
          { code: 'deadline-exceeded', expectedStatus: 504 },
        ]

        for (const { code, expectedStatus } of commonCodes) {
          // Test with different module prefixes
          expect(getHttpStatus(new AuthError(code as any, 'Test'))).toBe(expectedStatus)
          expect(getHttpStatus(new FirestoreError(code as any, 'Test'))).toBe(expectedStatus)
          expect(getHttpStatus(new StorageError(code as any, 'Test'))).toBe(expectedStatus)
        }
      })

      it('toHttpResponse should work with all typed errors', () => {
        const errors = [
          new AuthError('unauthenticated', 'Not authenticated'),
          new FirestoreError('not-found', 'Document not found'),
          new StorageError('object-not-found', 'Object not found'),
          new FunctionsError('cancelled', 'Request cancelled'),
        ]

        for (const error of errors) {
          const response = toHttpResponse(error)
          expect(response).toBeInstanceOf(Response)
          expect(response.headers.get('Content-Type')).toBe('application/json')
        }
      })
    })
  })
})
