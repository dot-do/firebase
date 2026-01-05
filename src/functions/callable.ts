/**
 * Firebase Callable Function Protocol Implementation
 *
 * Implements the Firebase callable function protocol:
 * - POST requests with JSON body containing { "data": {...} }
 * - Success responses return { "result": {...} }
 * - Error responses return { "error": { "message": "...", "status": "..." } }
 *
 * @see https://firebase.google.com/docs/functions/callable-reference
 */

import { verifyFirebaseToken, type VerifiedTokenPayload } from '../auth/jwt.js'

export interface CallableRequest {
  method: string
  headers: Record<string, string>
  body: unknown
}

export interface CallableResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}

export interface CallableAuthContext {
  token: string
  uid: string
  email?: string
  emailVerified?: boolean
  name?: string
  picture?: string
  signInProvider: string
  claims: Record<string, unknown>
}

export interface CallableContext {
  auth: CallableAuthContext | null
}

export type CallableFunction = (data: unknown, context: CallableContext) => Promise<unknown> | unknown

// Firebase error codes to HTTP status mapping
const ERROR_CODE_TO_HTTP_STATUS: Record<string, number> = {
  INVALID_ARGUMENT: 400,
  FAILED_PRECONDITION: 400,
  OUT_OF_RANGE: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  ABORTED: 409,
  RESOURCE_EXHAUSTED: 429,
  CANCELLED: 499,
  INTERNAL: 500,
  UNKNOWN: 500,
  DATA_LOSS: 500,
  UNIMPLEMENTED: 501,
  UNAVAILABLE: 503,
  DEADLINE_EXCEEDED: 504,
  // HTTP-specific error codes
  METHOD_NOT_ALLOWED: 405,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PAYLOAD_TOO_LARGE: 413,
}

export class CallableError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'CallableError'
  }
}

// Registry of callable functions
const functionRegistry = new Map<string, CallableFunction>()

// Maximum payload size (10MB)
const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024

/**
 * Register a callable function
 */
export function registerFunction(name: string, handler: CallableFunction): void {
  functionRegistry.set(name, handler)
}

/**
 * Get the size of a JSON-serializable value in bytes
 */
function getPayloadSize(data: unknown): number {
  return JSON.stringify(data).length
}

// Default project ID for token verification (can be overridden via setProjectId)
let configuredProjectId: string = 'demo-project'

/**
 * Set the project ID used for token verification
 */
export function setProjectId(projectId: string): void {
  configuredProjectId = projectId
}

/**
 * Get the current project ID
 */
export function getProjectId(): string {
  return configuredProjectId
}

/**
 * Parse Authorization header and verify JWT token
 *
 * Extracts the Bearer token from the Authorization header and verifies it
 * using the auth module's verifyFirebaseToken function.
 *
 * @param authHeader - The Authorization header value
 * @returns The authenticated user context or null if no auth header
 * @throws CallableError with UNAUTHENTICATED if token is invalid
 */
async function parseAuthHeader(authHeader: string | undefined): Promise<CallableAuthContext | null> {
  if (!authHeader) {
    return null
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new CallableError('UNAUTHENTICATED', 'Invalid Authorization header format. Expected "Bearer <token>"')
  }

  const token = parts[1]

  // Basic token validation
  if (!token) {
    throw new CallableError('UNAUTHENTICATED', 'Invalid or expired token')
  }

  // Verify the JWT token using the auth module
  try {
    const payload = await verifyFirebaseToken(token, configuredProjectId)

    // Extract user info from the verified token payload
    // user_id and sub are always the same in Firebase tokens (user UID)
    return {
      token,
      uid: payload.user_id,
      email: payload.email,
      emailVerified: payload.email_verified,
      name: payload.name,
      picture: payload.picture,
      signInProvider: payload.firebase?.sign_in_provider || 'custom',
      claims: extractCustomClaims(payload),
    }
  } catch (error) {
    // Handle specific JWT verification errors
    if (error instanceof Error) {
      if (error.message === 'TOKEN_EXPIRED') {
        throw new CallableError('UNAUTHENTICATED', 'Token has expired')
      }
      if (error.message === 'INVALID_ID_TOKEN') {
        throw new CallableError('UNAUTHENTICATED', 'Invalid or expired token')
      }
    }
    throw new CallableError('UNAUTHENTICATED', 'Invalid or expired token')
  }
}

/**
 * Extract custom claims from a verified token payload
 *
 * Filters out standard Firebase/JWT claims to return only custom claims
 */
function extractCustomClaims(payload: VerifiedTokenPayload): Record<string, unknown> {
  const standardClaims = new Set([
    'iss', 'aud', 'sub', 'user_id', 'auth_time', 'iat', 'exp',
    'email', 'email_verified', 'phone_number', 'name', 'picture', 'firebase'
  ])

  const customClaims: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (!standardClaims.has(key)) {
      customClaims[key] = value
    }
  }

  return customClaims
}

/**
 * Set CORS headers
 */
function setCorsHeaders(headers: Record<string, string>, requestHeaders: Record<string, string>): void {
  // Always allow all origins for callable functions (Firebase default behavior)
  headers['access-control-allow-origin'] = '*'

  // Set allowed methods
  headers['access-control-allow-methods'] = 'POST, OPTIONS'

  // Handle requested headers from preflight
  const requestedHeaders = requestHeaders['access-control-request-headers']
  if (requestedHeaders) {
    headers['access-control-allow-headers'] = requestedHeaders
  } else {
    headers['access-control-allow-headers'] = 'content-type, authorization'
  }

  // Set max age for preflight caching (1 hour)
  headers['access-control-max-age'] = '3600'
}

/**
 * Handle OPTIONS preflight request
 */
function handlePreflight(request: CallableRequest): CallableResponse {
  const headers: Record<string, string> = {}
  setCorsHeaders(headers, request.headers)

  return {
    status: 204,
    headers,
    body: null,
  }
}

/**
 * Create error response
 */
function createErrorResponse(
  error: unknown,
  requestHeaders: Record<string, string>
): CallableResponse {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  }
  setCorsHeaders(headers, requestHeaders)

  let status = 500
  let code = 'INTERNAL'
  let message = 'An unknown error occurred'
  let details: unknown = undefined

  if (error instanceof CallableError) {
    let errorCode = error.code
    message = error.message
    details = error.details
    status = ERROR_CODE_TO_HTTP_STATUS[errorCode] || 500

    // Map HTTP-specific error codes back to Firebase error codes for the response body
    if (errorCode === 'METHOD_NOT_ALLOWED' || errorCode === 'UNSUPPORTED_MEDIA_TYPE') {
      code = 'INVALID_ARGUMENT'
    } else if (errorCode === 'PAYLOAD_TOO_LARGE') {
      code = 'RESOURCE_EXHAUSTED'
    } else {
      code = errorCode
    }
  } else if (error instanceof Error) {
    message = error.message
  }

  const body: { error: { message: string; status: string; details?: unknown } } = {
    error: { message, status: code },
  }

  if (details !== undefined) {
    body.error.details = details
  }

  return { status, headers, body }
}

/**
 * Create success response
 */
function createSuccessResponse(
  result: unknown,
  requestHeaders: Record<string, string>
): CallableResponse {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  }
  setCorsHeaders(headers, requestHeaders)

  return {
    status: 200,
    headers,
    body: { result },
  }
}

/**
 * Validate request format
 */
function validateRequest(request: CallableRequest): void {
  // Check HTTP method (405 Method Not Allowed)
  if (request.method !== 'POST') {
    throw new CallableError(
      'METHOD_NOT_ALLOWED',
      `HTTP method must be POST, but received ${request.method}`
    )
  }

  // Check Content-Type header (415 Unsupported Media Type)
  const contentType = request.headers['content-type']
  if (!contentType) {
    throw new CallableError(
      'UNSUPPORTED_MEDIA_TYPE',
      'Missing Content-Type header. Expected application/json'
    )
  }

  // Accept application/json with optional charset (415 Unsupported Media Type)
  if (!contentType.startsWith('application/json')) {
    throw new CallableError(
      'UNSUPPORTED_MEDIA_TYPE',
      `Content-Type must be application/json, but received ${contentType}`
    )
  }

  // Check body exists
  if (request.body === null || request.body === undefined) {
    throw new CallableError('INVALID_ARGUMENT', 'Request body is required')
  }

  // Check body is an object
  if (typeof request.body !== 'object' || Array.isArray(request.body)) {
    throw new CallableError('INVALID_ARGUMENT', 'Request body must be a JSON object')
  }

  // Check for data field
  if (!('data' in request.body)) {
    throw new CallableError('INVALID_ARGUMENT', 'Request body must contain a "data" field')
  }

  // Check payload size (413 Payload Too Large)
  const bodySize = getPayloadSize(request.body)
  if (bodySize > MAX_PAYLOAD_SIZE) {
    throw new CallableError(
      'PAYLOAD_TOO_LARGE',
      `Request payload size (${bodySize} bytes) exceeds maximum allowed size (${MAX_PAYLOAD_SIZE} bytes)`
    )
  }
}

/**
 * Handle a callable function request
 */
export async function handleCallable(
  functionName: string,
  request: CallableRequest
): Promise<CallableResponse> {
  try {
    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return handlePreflight(request)
    }

    // Validate request format
    validateRequest(request)

    // Get the function handler
    const handler = functionRegistry.get(functionName)
    if (!handler) {
      throw new CallableError('NOT_FOUND', `Function "${functionName}" not found`)
    }

    // Parse and verify authorization header
    const auth = await parseAuthHeader(request.headers['authorization'])

    // Extract data from request body
    const body = request.body as { data: unknown }
    const data = body.data

    // Create context
    const context: CallableContext = { auth }

    // Call the function
    const result = await handler(data, context)

    // Return success response
    return createSuccessResponse(result, request.headers)
  } catch (error) {
    // Return error response
    return createErrorResponse(error, request.headers)
  }
}

// Export for testing
export function clearFunctions(): void {
  functionRegistry.clear()
}
