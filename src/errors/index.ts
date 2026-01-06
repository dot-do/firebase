/**
 * Firebase Error Hierarchy
 *
 * Provides a consistent error hierarchy with error codes across all modules.
 * All Firebase-related errors should extend FirebaseError.
 *
 * Error code format: 'module/error-code' (e.g., 'auth/invalid-token', 'firestore/not-found')
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Common error codes shared across modules
 */
export type CommonErrorCode =
  | 'invalid-argument'
  | 'failed-precondition'
  | 'out-of-range'
  | 'unauthenticated'
  | 'permission-denied'
  | 'not-found'
  | 'already-exists'
  | 'resource-exhausted'
  | 'cancelled'
  | 'aborted'
  | 'internal'
  | 'unknown'
  | 'unimplemented'
  | 'unavailable'
  | 'deadline-exceeded'
  | 'data-loss'

/**
 * Auth-specific error codes
 */
export type AuthErrorCode =
  | CommonErrorCode
  | 'invalid-token'
  | 'token-expired'
  | 'invalid-email'
  | 'email-exists'
  | 'user-not-found'
  | 'wrong-password'
  | 'weak-password'
  | 'invalid-credential'
  | 'user-disabled'
  | 'operation-not-allowed'
  | 'too-many-requests'

/**
 * Firestore-specific error codes
 */
export type FirestoreErrorCode =
  | CommonErrorCode
  | 'document-not-found'
  | 'document-already-exists'
  | 'invalid-document'
  | 'invalid-query'
  | 'invalid-value'
  | 'store-limit-exceeded'
  | 'batch-limit-exceeded'
  | 'circular-reference'

/**
 * Storage-specific error codes
 */
export type StorageErrorCode =
  | CommonErrorCode
  | 'object-not-found'
  | 'bucket-not-found'
  | 'invalid-path'
  | 'invalid-url'
  | 'invalid-checksum'
  | 'quota-exceeded'
  | 'retry-limit-exceeded'
  | 'upload-failed'

/**
 * Functions-specific error codes
 */
export type FunctionsErrorCode =
  | CommonErrorCode
  | 'function-not-found'
  | 'payload-too-large'
  | 'method-not-allowed'
  | 'unsupported-media-type'

/**
 * Rules-specific error codes
 */
export type RulesErrorCode =
  | CommonErrorCode
  | 'parse-error'
  | 'lexer-error'
  | 'syntax-error'
  | 'evaluation-error'
  | 'regex-security-error'
  | 'regex-timeout'
  | 'deployment-error'

/**
 * Config-specific error codes
 */
export type ConfigErrorCode =
  | CommonErrorCode
  | 'invalid-project-id'
  | 'invalid-endpoint'
  | 'invalid-emulator-host'
  | 'missing-required-field'

// ============================================================================
// Base Error Class
// ============================================================================

/**
 * Error details that can be attached to any FirebaseError
 */
export interface FirebaseErrorDetails {
  /** HTTP status code (if applicable) */
  httpStatus?: number
  /** The original error that caused this error */
  cause?: Error
  /** Additional context-specific details */
  [key: string]: unknown
}

/**
 * Base class for all Firebase-related errors.
 *
 * Provides a consistent interface with:
 * - `code`: A namespaced error code (e.g., 'auth/invalid-token')
 * - `message`: Human-readable error description
 * - `details`: Optional additional context
 *
 * @example
 * ```ts
 * throw new FirebaseError('auth/invalid-token', 'The token is invalid or expired')
 * throw new FirebaseError('firestore/not-found', 'Document not found', { path: '/users/123' })
 * ```
 */
export class FirebaseError extends Error {
  /** Error name for stack traces */
  override name = 'FirebaseError'

  /**
   * Create a new FirebaseError
   *
   * @param code - Namespaced error code (e.g., 'auth/invalid-token')
   * @param message - Human-readable error description
   * @param details - Optional additional context
   */
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: FirebaseErrorDetails
  ) {
    super(message)

    // Maintain proper stack trace in V8 environments (Node.js, Chrome)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }

    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, new.target.prototype)
  }

  /**
   * Convert the error to a JSON-serializable object
   */
  toJSON(): { code: string; message: string; details?: FirebaseErrorDetails } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    }
  }

  /**
   * Create a string representation of the error
   */
  override toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`
  }
}

// ============================================================================
// Module-Specific Error Classes
// ============================================================================

/**
 * Auth module errors
 */
export class AuthError extends FirebaseError {
  override name = 'AuthError'

  constructor(
    code: AuthErrorCode,
    message: string,
    details?: FirebaseErrorDetails
  ) {
    super(`auth/${code}`, message, details)
  }
}

/**
 * Firestore module errors
 */
export class FirestoreError extends FirebaseError {
  override name = 'FirestoreError'

  constructor(
    code: FirestoreErrorCode,
    message: string,
    details?: FirebaseErrorDetails
  ) {
    super(`firestore/${code}`, message, details)
  }
}

/**
 * Storage module errors
 */
export class StorageError extends FirebaseError {
  override name = 'StorageError'

  constructor(
    code: StorageErrorCode,
    message: string,
    details?: FirebaseErrorDetails
  ) {
    super(`storage/${code}`, message, details)
  }
}

/**
 * Functions module errors
 */
export class FunctionsError extends FirebaseError {
  override name = 'FunctionsError'

  constructor(
    code: FunctionsErrorCode,
    message: string,
    details?: FirebaseErrorDetails
  ) {
    super(`functions/${code}`, message, details)
  }
}

/**
 * Rules module errors
 */
export class RulesError extends FirebaseError {
  override name = 'RulesError'

  constructor(
    code: RulesErrorCode,
    message: string,
    details?: FirebaseErrorDetails
  ) {
    super(`rules/${code}`, message, details)
  }
}

/**
 * Config module errors
 */
export class ConfigError extends FirebaseError {
  override name = 'ConfigError'

  constructor(
    code: ConfigErrorCode,
    message: string,
    details?: FirebaseErrorDetails
  ) {
    super(`config/${code}`, message, details)
  }
}

// ============================================================================
// Specialized Error Subclasses
// ============================================================================

/**
 * Parse error with source location information
 */
export class ParseError extends RulesError {
  override name = 'ParseError'

  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
    public readonly offset: number,
    public readonly source?: string
  ) {
    super('parse-error', `${message} at line ${line}, column ${column}`, {
      line,
      column,
      offset,
      source,
    })
  }
}

/**
 * Lexer error (tokenization failure)
 */
export class LexerError extends ParseError {
  override name = 'LexerError'

  constructor(
    message: string,
    line: number,
    column: number,
    offset: number,
    source?: string
  ) {
    super(message, line, column, offset, source)
    // Update the code to be more specific
    ;(this as { code: string }).code = 'rules/lexer-error'
  }
}

/**
 * Syntax error during parsing
 */
export class SyntaxError extends ParseError {
  override name = 'SyntaxError'

  constructor(
    message: string,
    line: number,
    column: number,
    offset: number,
    public readonly token?: string,
    source?: string
  ) {
    super(message, line, column, offset, source)
    // Update the code to be more specific
    ;(this as { code: string }).code = 'rules/syntax-error'
    if (token) {
      ;(this.details as FirebaseErrorDetails).token = token
    }
  }
}

/**
 * Evaluation error during rules execution
 */
export class EvaluationError extends RulesError {
  override name = 'EvaluationError'

  constructor(message: string, public readonly expression?: string) {
    super('evaluation-error', message, expression ? { expression } : undefined)
  }
}

/**
 * Regex security error (dangerous pattern detected)
 */
export class RegexSecurityError extends RulesError {
  override name = 'RegexSecurityError'

  constructor(message: string, public readonly pattern?: string) {
    super('regex-security-error', message, pattern ? { pattern } : undefined)
  }
}

/**
 * Regex timeout error
 */
export class RegexTimeoutError extends RulesError {
  override name = 'RegexTimeoutError'

  constructor(message: string, public readonly pattern?: string) {
    super('regex-timeout', message, pattern ? { pattern } : undefined)
  }
}

/**
 * Rules deployment error
 */
export class RulesDeploymentError extends RulesError {
  override name = 'RulesDeploymentError'

  constructor(message: string, public readonly source?: string) {
    super('deployment-error', message, source ? { source } : undefined)
  }
}

/**
 * Callable function error (for backward compatibility)
 */
export class CallableError extends FunctionsError {
  override name = 'CallableError'

  constructor(code: string, message: string, callableDetails?: unknown) {
    // Map legacy codes to new error codes
    const mappedCode = mapLegacyFunctionsCode(code)
    // Always create details object to store originalCode
    const details: FirebaseErrorDetails = callableDetails ? { callableDetails } : {}
    // Store the original code for backward compatibility
    details.originalCode = code
    super(mappedCode, message, details)
  }
}

/**
 * Resumable upload error
 */
export class ResumableUploadError extends StorageError {
  override name = 'ResumableUploadError'

  constructor(message: string, public readonly uploadId?: string) {
    super('upload-failed', message, uploadId ? { uploadId } : undefined)
  }
}

/**
 * Invalid path error
 */
export class InvalidPathError extends StorageError {
  override name = 'InvalidPathError'

  constructor(message: string, public readonly path?: string) {
    super('invalid-path', message, path ? { path } : undefined)
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Map legacy Firebase function error codes to new error codes
 */
function mapLegacyFunctionsCode(code: string): FunctionsErrorCode {
  const mapping: Record<string, FunctionsErrorCode> = {
    INVALID_ARGUMENT: 'invalid-argument',
    FAILED_PRECONDITION: 'failed-precondition',
    OUT_OF_RANGE: 'out-of-range',
    UNAUTHENTICATED: 'unauthenticated',
    PERMISSION_DENIED: 'permission-denied',
    NOT_FOUND: 'not-found',
    ALREADY_EXISTS: 'already-exists',
    RESOURCE_EXHAUSTED: 'resource-exhausted',
    CANCELLED: 'cancelled',
    ABORTED: 'aborted',
    INTERNAL: 'internal',
    UNKNOWN: 'unknown',
    UNIMPLEMENTED: 'unimplemented',
    UNAVAILABLE: 'unavailable',
    DEADLINE_EXCEEDED: 'deadline-exceeded',
    DATA_LOSS: 'data-loss',
    METHOD_NOT_ALLOWED: 'method-not-allowed',
    UNSUPPORTED_MEDIA_TYPE: 'unsupported-media-type',
    PAYLOAD_TOO_LARGE: 'payload-too-large',
  }
  return mapping[code] || 'unknown'
}

/**
 * Check if an error is a FirebaseError
 */
export function isFirebaseError(error: unknown): error is FirebaseError {
  return error instanceof FirebaseError
}

/**
 * Check if an error has a specific error code
 */
export function hasErrorCode(error: unknown, code: string): boolean {
  return isFirebaseError(error) && error.code === code
}

/**
 * Check if an error belongs to a specific module
 */
export function isErrorFromModule(error: unknown, module: string): boolean {
  return isFirebaseError(error) && error.code.startsWith(`${module}/`)
}

/**
 * Create an error from a plain object (useful for deserialization)
 */
export function fromJSON(obj: {
  code: string
  message: string
  details?: FirebaseErrorDetails
}): FirebaseError {
  const [module] = obj.code.split('/')

  switch (module) {
    case 'auth':
      return new AuthError(obj.code.replace('auth/', '') as AuthErrorCode, obj.message, obj.details)
    case 'firestore':
      return new FirestoreError(
        obj.code.replace('firestore/', '') as FirestoreErrorCode,
        obj.message,
        obj.details
      )
    case 'storage':
      return new StorageError(
        obj.code.replace('storage/', '') as StorageErrorCode,
        obj.message,
        obj.details
      )
    case 'functions':
      return new FunctionsError(
        obj.code.replace('functions/', '') as FunctionsErrorCode,
        obj.message,
        obj.details
      )
    case 'rules':
      return new RulesError(
        obj.code.replace('rules/', '') as RulesErrorCode,
        obj.message,
        obj.details
      )
    case 'config':
      return new ConfigError(
        obj.code.replace('config/', '') as ConfigErrorCode,
        obj.message,
        obj.details
      )
    default:
      return new FirebaseError(obj.code, obj.message, obj.details)
  }
}

/**
 * HTTP status code mapping for error codes
 */
export const ERROR_HTTP_STATUS: Record<CommonErrorCode, number> = {
  'invalid-argument': 400,
  'failed-precondition': 400,
  'out-of-range': 400,
  'unauthenticated': 401,
  'permission-denied': 403,
  'not-found': 404,
  'already-exists': 409,
  'aborted': 409,
  'resource-exhausted': 429,
  'cancelled': 499,
  'internal': 500,
  'unknown': 500,
  'data-loss': 500,
  'unimplemented': 501,
  'unavailable': 503,
  'deadline-exceeded': 504,
}

/**
 * Get the HTTP status code for an error
 */
export function getHttpStatus(error: FirebaseError): number {
  // Check for explicit httpStatus in details
  if (error.details?.httpStatus) {
    return error.details.httpStatus as number
  }

  // Extract the error code without module prefix
  const [, code] = error.code.split('/')
  if (code && code in ERROR_HTTP_STATUS) {
    return ERROR_HTTP_STATUS[code as CommonErrorCode]
  }

  // Default to 500 Internal Server Error
  return 500
}

// ============================================================================
// Error Wrapping and Normalization
// ============================================================================

/**
 * Wrap an unknown error into a FirebaseError.
 * Useful for catch blocks where the error type is unknown.
 *
 * @param error - The unknown error to wrap
 * @param defaultCode - The default error code if the error is not a FirebaseError
 * @param defaultMessage - Optional default message override
 * @returns A FirebaseError instance
 *
 * @example
 * ```ts
 * try {
 *   await riskyOperation()
 * } catch (error) {
 *   throw wrapError(error, 'firestore/internal')
 * }
 * ```
 */
export function wrapError(
  error: unknown,
  defaultCode: string = 'unknown',
  defaultMessage?: string
): FirebaseError {
  // Already a FirebaseError - return as-is
  if (error instanceof FirebaseError) {
    return error
  }

  // Standard Error - wrap it
  if (error instanceof Error) {
    return new FirebaseError(defaultCode, defaultMessage || error.message, {
      cause: error,
    })
  }

  // String error
  if (typeof error === 'string') {
    return new FirebaseError(defaultCode, defaultMessage || error)
  }

  // Object with message property
  if (error && typeof error === 'object' && 'message' in error) {
    return new FirebaseError(
      defaultCode,
      defaultMessage || String((error as { message: unknown }).message)
    )
  }

  // Fallback for other types
  return new FirebaseError(defaultCode, defaultMessage || String(error))
}

/**
 * Wrap an error with a specific module's error class
 *
 * @param error - The unknown error to wrap
 * @param module - The module name ('auth', 'firestore', 'storage', 'functions', 'rules', 'config')
 * @param code - The error code without module prefix
 * @param message - Optional message override
 */
export function wrapModuleError(
  error: unknown,
  module: 'auth' | 'firestore' | 'storage' | 'functions' | 'rules' | 'config',
  code: string,
  message?: string
): FirebaseError {
  const cause = error instanceof Error ? error : undefined
  const errorMessage = message || (error instanceof Error ? error.message : String(error))

  switch (module) {
    case 'auth':
      return new AuthError(code as AuthErrorCode, errorMessage, { cause })
    case 'firestore':
      return new FirestoreError(code as FirestoreErrorCode, errorMessage, { cause })
    case 'storage':
      return new StorageError(code as StorageErrorCode, errorMessage, { cause })
    case 'functions':
      return new FunctionsError(code as FunctionsErrorCode, errorMessage, { cause })
    case 'rules':
      return new RulesError(code as RulesErrorCode, errorMessage, { cause })
    case 'config':
      return new ConfigError(code as ConfigErrorCode, errorMessage, { cause })
    default:
      return new FirebaseError(`${module}/${code}`, errorMessage, { cause })
  }
}

// ============================================================================
// Async Error Handling
// ============================================================================

/**
 * Result type for tryCatch operations
 */
export type Result<T, E = FirebaseError> =
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: E }

/**
 * Execute an async operation and return a Result type instead of throwing.
 * Converts any thrown error into a FirebaseError.
 *
 * @param fn - The async function to execute
 * @param errorCode - Default error code for non-Firebase errors
 * @returns A Result object with either data or error
 *
 * @example
 * ```ts
 * const result = await tryCatch(
 *   () => fetchDocument(id),
 *   'firestore/internal'
 * )
 * if (result.success) {
 *   console.log(result.data)
 * } else {
 *   console.error(result.error.code)
 * }
 * ```
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorCode: string = 'unknown'
): Promise<Result<T>> {
  try {
    const data = await fn()
    return { success: true, data }
  } catch (error) {
    return { success: false, error: wrapError(error, errorCode) }
  }
}

/**
 * Synchronous version of tryCatch
 *
 * @param fn - The function to execute
 * @param errorCode - Default error code for non-Firebase errors
 * @returns A Result object with either data or error
 */
export function tryCatchSync<T>(
  fn: () => T,
  errorCode: string = 'unknown'
): Result<T> {
  try {
    const data = fn()
    return { success: true, data }
  } catch (error) {
    return { success: false, error: wrapError(error, errorCode) }
  }
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Assert that a value is defined (not null or undefined)
 * @throws FirebaseError with 'invalid-argument' code
 */
export function assertDefined<T>(
  value: T | null | undefined,
  name: string,
  module: string = 'unknown'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new FirebaseError(
      `${module}/invalid-argument`,
      `${name} is required and cannot be null or undefined`
    )
  }
}

/**
 * Assert that a string is non-empty
 * @throws FirebaseError with 'invalid-argument' code
 */
export function assertNonEmptyString(
  value: unknown,
  name: string,
  module: string = 'unknown'
): asserts value is string {
  assertDefined(value, name, module)
  if (typeof value !== 'string') {
    throw new FirebaseError(
      `${module}/invalid-argument`,
      `${name} must be a string, got ${typeof value}`
    )
  }
  if (value.trim().length === 0) {
    throw new FirebaseError(
      `${module}/invalid-argument`,
      `${name} cannot be empty`
    )
  }
}

/**
 * Assert that a value is a positive integer
 * @throws FirebaseError with 'invalid-argument' code
 */
export function assertPositiveInteger(
  value: unknown,
  name: string,
  module: string = 'unknown'
): asserts value is number {
  assertDefined(value, name, module)
  if (typeof value !== 'number') {
    throw new FirebaseError(
      `${module}/invalid-argument`,
      `${name} must be a number, got ${typeof value}`
    )
  }
  if (!Number.isFinite(value)) {
    throw new FirebaseError(
      `${module}/invalid-argument`,
      `${name} must be finite (not NaN or Infinity)`
    )
  }
  if (!Number.isInteger(value)) {
    throw new FirebaseError(
      `${module}/invalid-argument`,
      `${name} must be an integer, got ${value}`
    )
  }
  if (value <= 0) {
    throw new FirebaseError(
      `${module}/invalid-argument`,
      `${name} must be positive, got ${value}`
    )
  }
}

/**
 * Assert that a value is within a range
 * @throws FirebaseError with 'out-of-range' code
 */
export function assertInRange(
  value: number,
  min: number,
  max: number,
  name: string,
  module: string = 'unknown'
): void {
  if (value < min || value > max) {
    throw new FirebaseError(
      `${module}/out-of-range`,
      `${name} must be between ${min} and ${max}, got ${value}`
    )
  }
}

// ============================================================================
// HTTP Response Utilities
// ============================================================================

/**
 * HTTP error response format
 */
export interface HttpErrorResponse {
  error: {
    code: number
    message: string
    status: string
    details?: FirebaseErrorDetails
  }
}

/**
 * Create an HTTP error response object from a FirebaseError
 *
 * @param error - The FirebaseError to convert
 * @returns An HTTP error response object
 *
 * @example
 * ```ts
 * catch (error) {
 *   const wrapped = wrapError(error, 'auth/internal')
 *   const response = toHttpErrorResponse(wrapped)
 *   return new Response(JSON.stringify(response), {
 *     status: getHttpStatus(wrapped),
 *     headers: { 'Content-Type': 'application/json' }
 *   })
 * }
 * ```
 */
export function toHttpErrorResponse(error: FirebaseError): HttpErrorResponse {
  const httpStatus = getHttpStatus(error)
  return {
    error: {
      code: httpStatus,
      message: error.message,
      status: error.code,
      ...(error.details && { details: error.details }),
    },
  }
}

/**
 * Create a Response object from a FirebaseError
 *
 * @param error - The FirebaseError to convert
 * @returns A Response object with JSON error body
 */
export function toHttpResponse(error: FirebaseError): Response {
  const httpStatus = getHttpStatus(error)
  const body = toHttpErrorResponse(error)
  return new Response(JSON.stringify(body), {
    status: httpStatus,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Extract the error code suffix (without module prefix)
 *
 * @param error - The FirebaseError to extract from
 * @returns The error code without module prefix
 *
 * @example
 * ```ts
 * const error = new AuthError('invalid-token', 'Token is invalid')
 * getErrorCodeSuffix(error) // 'invalid-token'
 * ```
 */
export function getErrorCodeSuffix(error: FirebaseError): string {
  const parts = error.code.split('/')
  return parts.length > 1 ? parts[1] : parts[0]
}

/**
 * Extract the module prefix from an error code
 *
 * @param error - The FirebaseError to extract from
 * @returns The module prefix or 'unknown'
 *
 * @example
 * ```ts
 * const error = new AuthError('invalid-token', 'Token is invalid')
 * getErrorModule(error) // 'auth'
 * ```
 */
export function getErrorModule(error: FirebaseError): string {
  const parts = error.code.split('/')
  return parts.length > 1 ? parts[0] : 'unknown'
}

// ============================================================================
// Error Aggregation
// ============================================================================

/**
 * Aggregate multiple errors into a single error
 */
export class AggregateFirebaseError extends FirebaseError {
  override name = 'AggregateFirebaseError'

  constructor(
    public readonly errors: FirebaseError[],
    message?: string
  ) {
    const errorMessages = errors.map((e) => e.message).join('; ')
    super(
      'aggregate/multiple-errors',
      message || `Multiple errors occurred: ${errorMessages}`,
      { errorCount: errors.length }
    )
  }

  /**
   * Get all error codes from the aggregated errors
   */
  getCodes(): string[] {
    return this.errors.map((e) => e.code)
  }

  /**
   * Check if any of the aggregated errors has a specific code
   */
  hasCode(code: string): boolean {
    return this.errors.some((e) => e.code === code)
  }
}
