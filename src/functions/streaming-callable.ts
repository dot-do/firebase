/**
 * Firebase Streaming Callable Function Protocol Implementation
 *
 * Implements streaming callable functions using:
 * - NDJSON (Newline Delimited JSON) format
 * - SSE (Server-Sent Events) format
 * - Chunked transfer encoding
 *
 * Each chunk is formatted as:
 * - { "message": {...} } for intermediate values
 * - { "result": {...} } for final completion
 * - { "error": { "message": "...", "status": "..." } } for errors
 *
 * @see https://firebase.google.com/docs/functions/callable-reference
 */

import { verifyFirebaseToken, type VerifiedTokenPayload } from '../auth/jwt.js'
import { FunctionsError } from '../errors/index.js'

export interface CallableRequest {
  method: string
  headers: Record<string, string>
  body: unknown
  signal?: AbortSignal
}

export interface StreamChunk {
  message?: unknown
  result?: unknown
  error?: {
    message: string
    status: string
    details?: unknown
  }
}

export interface StreamingCallableResponse {
  status: number
  headers: Record<string, string>
  body?: unknown
  stream: AsyncIterable<StreamChunk>
  /** Convert stream to NDJSON string (for testing) */
  toNDJSON: () => Promise<string>
  /** Convert stream to SSE string (for testing) */
  toSSE: () => Promise<string>
}

export interface StreamingCallableContext {
  auth: StreamingCallableAuthContext | null
  /** Unique instance ID for this function invocation */
  instanceId: string
  /** The raw request object for advanced use cases */
  rawRequest: CallableRequest
}

export interface StreamingCallableAuthContext {
  token: string
  uid: string
  email?: string
  emailVerified?: boolean
  name?: string
  picture?: string
  signInProvider: string
  claims: Record<string, unknown>
}

export type StreamingCallableFunction = (
  data: unknown,
  context: StreamingCallableContext
) => AsyncGenerator<unknown, void, unknown>

// Registry of streaming callable functions
const streamingFunctionRegistry = new Map<string, StreamingCallableFunction>()

// Default project ID for token verification
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
 * Register a streaming callable function
 */
export function registerStreamingFunction(name: string, handler: StreamingCallableFunction): void {
  streamingFunctionRegistry.set(name, handler)
}

/**
 * Clear all registered streaming functions (for testing)
 */
export function clearStreamingFunctions(): void {
  streamingFunctionRegistry.clear()
}

/**
 * Generate a unique instance ID for function invocations
 */
function generateInstanceId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `${timestamp}-${random}`
}

/**
 * Firebase error codes to status mapping
 */
const FIREBASE_ERROR_CODES: Record<string, string> = {
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  FAILED_PRECONDITION: 'FAILED_PRECONDITION',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  ABORTED: 'ABORTED',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  CANCELLED: 'CANCELLED',
  INTERNAL: 'INTERNAL',
  UNKNOWN: 'UNKNOWN',
  DATA_LOSS: 'DATA_LOSS',
  UNIMPLEMENTED: 'UNIMPLEMENTED',
  UNAVAILABLE: 'UNAVAILABLE',
  DEADLINE_EXCEEDED: 'DEADLINE_EXCEEDED',
}

/**
 * Map an error to a Firebase error code
 */
function mapErrorToFirebaseCode(error: Error): string {
  const message = error.message

  // Check for error code prefix in message (e.g., "UNAUTHENTICATED: message")
  for (const code of Object.keys(FIREBASE_ERROR_CODES)) {
    if (message.startsWith(`${code}:`)) {
      return code
    }
  }

  return 'INTERNAL'
}

/**
 * Extract custom claims from a verified token payload
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
 * Parse Authorization header and verify JWT token
 */
async function parseAuthHeader(authHeader: string | undefined): Promise<StreamingCallableAuthContext | null> {
  if (!authHeader) {
    return null
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new FunctionsError('unauthenticated', 'Invalid Authorization header format')
  }

  const token = parts[1]
  if (!token) {
    throw new FunctionsError('unauthenticated', 'Invalid or expired token')
  }

  try {
    const payload = await verifyFirebaseToken(token, configuredProjectId)

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
    if (error instanceof Error) {
      if (error.message === 'TOKEN_EXPIRED') {
        throw new FunctionsError('unauthenticated', 'Token has expired')
      }
    }
    throw new FunctionsError('unauthenticated', 'Invalid or expired token')
  }
}

/**
 * Set CORS headers for streaming responses
 */
function setCorsHeaders(headers: Record<string, string>, requestHeaders: Record<string, string>): void {
  headers['access-control-allow-origin'] = '*'
  headers['access-control-allow-methods'] = 'POST, OPTIONS'

  const requestedHeaders = requestHeaders['access-control-request-headers']
  if (requestedHeaders) {
    headers['access-control-allow-headers'] = requestedHeaders
  } else {
    headers['access-control-allow-headers'] = 'content-type, authorization'
  }

  headers['access-control-max-age'] = '3600'
}

/**
 * Handle OPTIONS preflight request
 */
function handlePreflight(request: CallableRequest): StreamingCallableResponse {
  const headers: Record<string, string> = {}
  setCorsHeaders(headers, request.headers)

  return {
    status: 204,
    headers,
    body: null,
    stream: (async function* () {})(),
    toNDJSON: async () => '',
    toSSE: async () => '',
  }
}

/**
 * Create an error response (non-streaming)
 */
function createErrorResponse(
  status: number,
  code: string,
  message: string,
  requestHeaders: Record<string, string>
): StreamingCallableResponse {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  }
  setCorsHeaders(headers, requestHeaders)

  const errorBody = {
    error: {
      message,
      status: code,
    },
  }

  return {
    status,
    headers,
    body: errorBody,
    stream: (async function* () {})(),
    toNDJSON: async () => JSON.stringify(errorBody) + '\n',
    toSSE: async () => `event: error\ndata: ${JSON.stringify(errorBody)}\n\n`,
  }
}

/**
 * Determine the content type based on Accept header
 */
function getContentType(acceptHeader?: string): 'application/x-ndjson' | 'text/event-stream' {
  if (acceptHeader === 'text/event-stream') {
    return 'text/event-stream'
  }
  return 'application/x-ndjson'
}

/**
 * Handle a streaming callable function request
 */
export async function handleStreamingCallable(
  functionName: string,
  request: CallableRequest
): Promise<StreamingCallableResponse> {
  // Handle OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return handlePreflight(request)
  }

  // Validate request method
  if (request.method !== 'POST') {
    return createErrorResponse(
      405,
      'INVALID_ARGUMENT',
      `HTTP method must be POST, but received ${request.method}`,
      request.headers
    )
  }

  // Get the function handler
  const handler = streamingFunctionRegistry.get(functionName)
  if (!handler) {
    return createErrorResponse(
      404,
      'NOT_FOUND',
      `Function "${functionName}" not found`,
      request.headers
    )
  }

  // Determine content type based on Accept header
  const contentType = getContentType(request.headers['accept'])

  // Build response headers
  const headers: Record<string, string> = {
    'content-type': contentType,
    'transfer-encoding': 'chunked',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  }
  setCorsHeaders(headers, request.headers)

  // Parse and verify authorization header
  let auth: StreamingCallableAuthContext | null = null
  try {
    auth = await parseAuthHeader(request.headers['authorization'])
  } catch (error) {
    // Auth errors will be caught by the generator if the function requires auth
  }

  // Extract data from request body
  const body = request.body as { data: unknown } | null
  const data = body?.data ?? {}

  // Create context
  const context: StreamingCallableContext = {
    auth,
    instanceId: generateInstanceId(),
    rawRequest: request,
  }

  // Create the generator
  const generator = handler(data, context)

  // State for stream management
  let aborted = false
  let generatorClosed = false
  let streamEnded = false
  const collectedChunks: StreamChunk[] = []

  // Set up abort handler
  if (request.signal) {
    request.signal.addEventListener('abort', () => {
      aborted = true
      if (!generatorClosed) {
        generatorClosed = true
        generator.return(undefined).catch(() => {
          // Ignore errors when closing generator
        })
      }
    }, { once: true })
  }

  // Create the stream
  const stream: AsyncIterable<StreamChunk> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<StreamChunk>> {
          // If stream already ended, return done
          if (streamEnded) {
            return { done: true, value: undefined as unknown as StreamChunk }
          }

          // If aborted, throw
          if (aborted) {
            streamEnded = true
            throw new FunctionsError('cancelled', 'Stream aborted')
          }

          try {
            const result = await generator.next()

            if (result.done) {
              // Generator completed
              streamEnded = true
              return { done: true, value: undefined as unknown as StreamChunk }
            }

            // Wrap the yielded value in a message chunk
            const messageChunk: StreamChunk = { message: result.value }
            collectedChunks.push(messageChunk)
            return { done: false, value: messageChunk }
          } catch (error) {
            // Handle errors from the generator
            streamEnded = true
            const errorCode = error instanceof Error ? mapErrorToFirebaseCode(error) : 'INTERNAL'
            const errorMessage = error instanceof Error ? error.message.replace(/^[A-Z_]+:\s*/, '') : 'An unknown error occurred'

            const errorChunk: StreamChunk = {
              error: {
                message: errorMessage,
                status: errorCode,
              },
            }
            collectedChunks.push(errorChunk)
            return { done: false, value: errorChunk }
          }
        },
        async return(): Promise<IteratorResult<StreamChunk>> {
          streamEnded = true
          if (!generatorClosed) {
            generatorClosed = true
            await generator.return(undefined)
          }
          return { done: true, value: undefined as unknown as StreamChunk }
        },
      }
    },
  }

  // Wrap stream to properly terminate after result/error
  let resultOrErrorReturned = false
  let needsResultChunk = true
  const wrappedStream: AsyncIterable<StreamChunk> = {
    [Symbol.asyncIterator]() {
      const iterator = stream[Symbol.asyncIterator]()

      return {
        async next(): Promise<IteratorResult<StreamChunk>> {
          // If we already returned a result or error, we're done
          if (resultOrErrorReturned) {
            return { done: true, value: undefined as unknown as StreamChunk }
          }

          const result = await iterator.next()

          if (result.done) {
            // Stream ended - add a final result chunk if needed
            if (needsResultChunk) {
              needsResultChunk = false
              resultOrErrorReturned = true
              const resultChunk: StreamChunk = { result: { success: true } }
              collectedChunks.push(resultChunk)
              return { done: false, value: resultChunk }
            }
            return { done: true, value: undefined as unknown as StreamChunk }
          }

          const chunk = result.value

          // Check if this is a terminal chunk (result or error)
          if ('result' in chunk || 'error' in chunk) {
            resultOrErrorReturned = true
            needsResultChunk = false
          }

          return { done: false, value: chunk }
        },
        async return(): Promise<IteratorResult<StreamChunk>> {
          resultOrErrorReturned = true
          needsResultChunk = false
          const iteratorReturn = iterator.return
          if (iteratorReturn) {
            return iteratorReturn.call(iterator)
          }
          return { done: true, value: undefined as unknown as StreamChunk }
        },
      }
    },
  }

  // Helper to collect all chunks from iteration
  async function collectAllChunks(): Promise<StreamChunk[]> {
    // If we already collected, return cached
    if (streamEnded && collectedChunks.length >= 0) {
      return collectedChunks
    }

    // Otherwise collect from the wrapped stream
    for await (const chunk of wrappedStream) {
      // Chunks are already added to collectedChunks by the stream iterator
    }

    return collectedChunks
  }

  // toNDJSON helper - includes result chunk at end
  async function toNDJSON(): Promise<string> {
    const allChunks = await collectAllChunks()
    // Add result chunk at the end if not already present
    const hasResult = allChunks.some(c => 'result' in c)
    const hasError = allChunks.some(c => 'error' in c)
    const chunksToSerialize = [...allChunks]
    if (!hasResult && !hasError) {
      chunksToSerialize.push({ result: { success: true } })
    }
    return chunksToSerialize.map(chunk => JSON.stringify(chunk)).join('\n') + '\n'
  }

  // toSSE helper - includes result chunk at end
  async function toSSE(): Promise<string> {
    const allChunks = await collectAllChunks()
    // Add result chunk at the end if not already present
    const hasResult = allChunks.some(c => 'result' in c)
    const hasError = allChunks.some(c => 'error' in c)
    const chunksToSerialize = [...allChunks]
    if (!hasResult && !hasError) {
      chunksToSerialize.push({ result: { success: true } })
    }

    let output = ''

    for (const chunk of chunksToSerialize) {
      if ('message' in chunk) {
        output += `event: message\ndata: ${JSON.stringify(chunk)}\n\n`
      } else if ('result' in chunk) {
        output += `event: result\ndata: ${JSON.stringify(chunk)}\n\n`
        output += `event: done\ndata: {}\n\n`
      } else if ('error' in chunk) {
        output += `event: error\ndata: ${JSON.stringify(chunk)}\n\n`
        output += `event: done\ndata: {}\n\n`
      }
    }

    return output
  }

  return {
    status: 200,
    headers,
    stream: wrappedStream,
    toNDJSON,
    toSSE,
  }
}
