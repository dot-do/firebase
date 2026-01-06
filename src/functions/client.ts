/**
 * Firebase Functions Client SDK Implementation
 *
 * Provides client-side APIs matching the Firebase SDK interface:
 * - getFunctions() - Get a Functions instance for an app
 * - httpsCallable() - Create a callable function reference
 * - httpsCallableFromURL() - Create a callable function reference from a URL
 * - connectFunctionsEmulator() - Connect to a local Functions emulator
 *
 * @see https://firebase.google.com/docs/functions/callable
 */

/**
 * A minimal FirebaseApp interface for Functions
 */
export interface FirebaseApp {
  name: string
  options: {
    projectId?: string
    apiKey?: string
    authDomain?: string
  }
}

/**
 * A Functions instance for calling Cloud Functions
 */
export interface Functions {
  /** The FirebaseApp this Functions instance is associated with */
  app: FirebaseApp
  /** The region this Functions instance is configured for */
  region: string
  /** Custom domain for Functions (if configured) */
  customDomain: string | null
  /** @internal Emulator configuration */
  _emulatorConfig?: { host: string; port: number } | null
}

/**
 * Options for httpsCallable
 */
export interface HttpsCallableOptions {
  /** Timeout for the function call in milliseconds (default: 70000 - 70 seconds) */
  timeout?: number
  /** Whether to use limited-use App Check tokens */
  limitedUseAppCheckTokens?: boolean
}

/**
 * Options for streaming callable functions
 */
export interface HttpsCallableStreamOptions {
  /** AbortSignal to cancel the stream */
  signal?: AbortSignal
}

/**
 * Result from a callable function
 */
export interface HttpsCallableResult<ResponseData = unknown> {
  /** The data returned by the callable function */
  readonly data: ResponseData
}

/**
 * Result from a streaming callable function
 */
export interface HttpsCallableStreamResult<ResponseData = unknown, StreamData = unknown> {
  /** The stream of data from the callable function */
  readonly stream: AsyncIterable<StreamData>
  /** Promise that resolves when the stream completes with final data */
  readonly data: Promise<ResponseData>
}

/**
 * A reference to a callable function
 */
export interface HttpsCallable<RequestData = unknown, ResponseData = unknown, StreamData = unknown> {
  /**
   * Call the function with the given data
   */
  (data?: RequestData | null): Promise<HttpsCallableResult<ResponseData>>

  /**
   * Call the function and stream the response
   */
  stream(
    data?: RequestData | null,
    options?: HttpsCallableStreamOptions
  ): Promise<HttpsCallableStreamResult<ResponseData, StreamData>>
}

/**
 * Firebase Functions error codes (kebab-case format as used in client SDK)
 */
export type FunctionsErrorCodeCore =
  | 'ok'
  | 'cancelled'
  | 'unknown'
  | 'invalid-argument'
  | 'deadline-exceeded'
  | 'not-found'
  | 'already-exists'
  | 'permission-denied'
  | 'resource-exhausted'
  | 'failed-precondition'
  | 'aborted'
  | 'out-of-range'
  | 'unimplemented'
  | 'internal'
  | 'unavailable'
  | 'data-loss'
  | 'unauthenticated'

export type FunctionsErrorCode = `functions/${FunctionsErrorCodeCore}`

/**
 * Error thrown by callable functions
 */
export class FunctionsError extends Error {
  /** The error code */
  readonly code: FunctionsErrorCode
  /** Additional details about the error */
  readonly details?: unknown

  constructor(code: FunctionsErrorCodeCore, message?: string, details?: unknown) {
    super(message || code)
    this.name = 'FunctionsError'
    this.code = `functions/${code}`
    this.details = details
  }
}

// Map from server error codes (SCREAMING_CASE) to client error codes (kebab-case)
const SERVER_TO_CLIENT_ERROR_CODE: Record<string, FunctionsErrorCodeCore> = {
  OK: 'ok',
  CANCELLED: 'cancelled',
  UNKNOWN: 'unknown',
  INVALID_ARGUMENT: 'invalid-argument',
  DEADLINE_EXCEEDED: 'deadline-exceeded',
  NOT_FOUND: 'not-found',
  ALREADY_EXISTS: 'already-exists',
  PERMISSION_DENIED: 'permission-denied',
  RESOURCE_EXHAUSTED: 'resource-exhausted',
  FAILED_PRECONDITION: 'failed-precondition',
  ABORTED: 'aborted',
  OUT_OF_RANGE: 'out-of-range',
  UNIMPLEMENTED: 'unimplemented',
  INTERNAL: 'internal',
  UNAVAILABLE: 'unavailable',
  DATA_LOSS: 'data-loss',
  UNAUTHENTICATED: 'unauthenticated',
}

// Default timeout in milliseconds (70 seconds, matching Firebase SDK)
const DEFAULT_TIMEOUT = 70000

// Registry of Functions instances (keyed by app name + region)
const functionsInstances = new Map<string, Functions>()

// Token provider for authentication (can be set by the user)
let authTokenProvider: (() => Promise<string | null>) | null = null

/**
 * Set the auth token provider for authenticated calls
 *
 * @param provider - A function that returns a Promise resolving to an auth token or null
 */
export function setAuthTokenProvider(provider: (() => Promise<string | null>) | null): void {
  authTokenProvider = provider
}

/**
 * Get a Functions instance for the given app
 *
 * @param app - The FirebaseApp to use (defaults to a demo app)
 * @param regionOrCustomDomain - The region or custom domain for the Functions instance
 * @returns A Functions instance
 */
export function getFunctions(app?: FirebaseApp, regionOrCustomDomain?: string): Functions {
  // Default app if none provided
  const firebaseApp = app || {
    name: '[DEFAULT]',
    options: { projectId: 'demo-project' },
  }

  // Parse region/custom domain
  let region = 'us-central1'
  let customDomain: string | null = null

  if (regionOrCustomDomain) {
    if (regionOrCustomDomain.startsWith('http://') || regionOrCustomDomain.startsWith('https://')) {
      customDomain = regionOrCustomDomain
    } else {
      region = regionOrCustomDomain
    }
  }

  // Check for existing instance
  const key = `${firebaseApp.name}:${region}:${customDomain || ''}`
  const existing = functionsInstances.get(key)
  if (existing) {
    return existing
  }

  // Create new instance
  const functions: Functions = {
    app: firebaseApp,
    region,
    customDomain,
    _emulatorConfig: null,
  }

  functionsInstances.set(key, functions)
  return functions
}

/**
 * Connect to a Functions emulator
 *
 * @param functionsInstance - The Functions instance to configure
 * @param host - The emulator host (e.g., 'localhost')
 * @param port - The emulator port (e.g., 5001)
 */
export function connectFunctionsEmulator(
  functionsInstance: Functions,
  host: string,
  port: number
): void {
  functionsInstance._emulatorConfig = { host, port }
}

/**
 * Build the URL for a callable function
 */
function buildFunctionUrl(functionsInstance: Functions, name: string): string {
  // If connected to emulator, use emulator URL
  if (functionsInstance._emulatorConfig) {
    const { host, port } = functionsInstance._emulatorConfig
    const projectId = functionsInstance.app.options.projectId || 'demo-project'
    return `http://${host}:${port}/${projectId}/${functionsInstance.region}/${name}`
  }

  // If custom domain is set, use it
  if (functionsInstance.customDomain) {
    return `${functionsInstance.customDomain}/${name}`
  }

  // Default to production URL
  const projectId = functionsInstance.app.options.projectId
  if (!projectId) {
    throw new FunctionsError('invalid-argument', 'projectId is required in app options')
  }

  return `https://${functionsInstance.region}-${projectId}.cloudfunctions.net/${name}`
}

/**
 * Convert server error code to client error code
 */
function convertErrorCode(serverCode: string): FunctionsErrorCodeCore {
  return SERVER_TO_CLIENT_ERROR_CODE[serverCode] || 'internal'
}

/**
 * Create a callable function reference
 *
 * @param functionsInstance - The Functions instance to use
 * @param name - The name of the callable function
 * @param options - Options for the callable function
 * @returns A callable function reference
 */
export function httpsCallable<RequestData = unknown, ResponseData = unknown, StreamData = unknown>(
  functionsInstance: Functions,
  name: string,
  options?: HttpsCallableOptions
): HttpsCallable<RequestData, ResponseData, StreamData> {
  const url = buildFunctionUrl(functionsInstance, name)
  return httpsCallableFromURL<RequestData, ResponseData, StreamData>(functionsInstance, url, options)
}

/**
 * Create a callable function reference from a URL
 *
 * @param functionsInstance - The Functions instance to use
 * @param url - The URL of the callable function
 * @param options - Options for the callable function
 * @returns A callable function reference
 */
export function httpsCallableFromURL<RequestData = unknown, ResponseData = unknown, StreamData = unknown>(
  _functionsInstance: Functions,
  url: string,
  options?: HttpsCallableOptions
): HttpsCallable<RequestData, ResponseData, StreamData> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT

  // Create the callable function
  const callable = async (data?: RequestData | null): Promise<HttpsCallableResult<ResponseData>> => {
    // Build request headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Add auth token if available
    if (authTokenProvider) {
      try {
        const token = await authTokenProvider()
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
      } catch {
        // Ignore auth errors - the function may not require auth
      }
    }

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      // Make the request
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ data: data ?? null }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Parse response
      const responseBody = await response.json() as {
        result?: ResponseData
        error?: { message: string; status: string; details?: unknown }
      }

      // Handle error response
      if (responseBody.error) {
        const { message, status, details } = responseBody.error
        throw new FunctionsError(convertErrorCode(status), message, details)
      }

      // Return success response
      return { data: responseBody.result as ResponseData }
    } catch (error) {
      clearTimeout(timeoutId)

      // Re-throw FunctionsError as-is
      if (error instanceof FunctionsError) {
        throw error
      }

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw new FunctionsError('deadline-exceeded', 'Request timed out')
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw new FunctionsError('unavailable', 'Failed to connect to the server')
      }

      // Handle other errors
      throw new FunctionsError(
        'internal',
        error instanceof Error ? error.message : 'An unknown error occurred'
      )
    }
  }

  // Add streaming support
  callable.stream = async (
    data?: RequestData | null,
    streamOptions?: HttpsCallableStreamOptions
  ): Promise<HttpsCallableStreamResult<ResponseData, StreamData>> => {
    // Build request headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
    }

    // Add auth token if available
    if (authTokenProvider) {
      try {
        const token = await authTokenProvider()
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
      } catch {
        // Ignore auth errors - the function may not require auth
      }
    }

    // Create abort controller
    const controller = new AbortController()
    const signal = streamOptions?.signal

    // Link external signal to our controller
    if (signal) {
      if (signal.aborted) {
        controller.abort()
      } else {
        signal.addEventListener('abort', () => controller.abort())
      }
    }

    // Make the request
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: data ?? null }),
      signal: controller.signal,
    })

    if (!response.ok) {
      // Try to parse error response
      try {
        const errorBody = await response.json() as {
          error?: { message: string; status: string; details?: unknown }
        }
        if (errorBody.error) {
          throw new FunctionsError(
            convertErrorCode(errorBody.error.status),
            errorBody.error.message,
            errorBody.error.details
          )
        }
      } catch (e) {
        if (e instanceof FunctionsError) throw e
      }
      throw new FunctionsError('internal', `HTTP error: ${response.status}`)
    }

    // Get the response body as a readable stream
    const reader = response.body?.getReader()
    if (!reader) {
      throw new FunctionsError('internal', 'Response body is not readable')
    }

    // State for collecting final result
    let finalResult: ResponseData | undefined
    let resultResolve: ((value: ResponseData) => void) | undefined
    let resultReject: ((reason: unknown) => void) | undefined

    const resultPromise = new Promise<ResponseData>((resolve, reject) => {
      resultResolve = resolve
      resultReject = reject
    })

    // Create async iterable for stream
    const stream: AsyncIterable<StreamData> = {
      [Symbol.asyncIterator]() {
        const decoder = new TextDecoder()
        let buffer = ''
        let done = false

        return {
          async next(): Promise<IteratorResult<StreamData>> {
            if (done) {
              return { done: true, value: undefined as unknown as StreamData }
            }

            while (true) {
              // Check for complete lines in buffer
              const newlineIndex = buffer.indexOf('\n')
              if (newlineIndex !== -1) {
                const line = buffer.slice(0, newlineIndex)
                buffer = buffer.slice(newlineIndex + 1)

                if (line.trim()) {
                  try {
                    const chunk = JSON.parse(line) as {
                      message?: StreamData
                      result?: ResponseData
                      error?: { message: string; status: string; details?: unknown }
                    }

                    // Handle error chunk
                    if (chunk.error) {
                      done = true
                      const error = new FunctionsError(
                        convertErrorCode(chunk.error.status),
                        chunk.error.message,
                        chunk.error.details
                      )
                      resultReject?.(error)
                      throw error
                    }

                    // Handle result chunk (final)
                    if (chunk.result !== undefined) {
                      done = true
                      finalResult = chunk.result
                      resultResolve?.(chunk.result)
                      return { done: true, value: undefined as unknown as StreamData }
                    }

                    // Handle message chunk
                    if (chunk.message !== undefined) {
                      return { done: false, value: chunk.message }
                    }
                  } catch (e) {
                    if (e instanceof FunctionsError) throw e
                    // Skip invalid JSON lines
                  }
                }
                continue
              }

              // Read more data
              const { done: readerDone, value } = await reader.read()
              if (readerDone) {
                done = true
                // If we have remaining buffer, try to parse it
                if (buffer.trim()) {
                  try {
                    const chunk = JSON.parse(buffer) as {
                      result?: ResponseData
                      error?: { message: string; status: string; details?: unknown }
                    }
                    if (chunk.result !== undefined) {
                      finalResult = chunk.result
                      resultResolve?.(chunk.result)
                    } else if (chunk.error) {
                      resultReject?.(new FunctionsError(
                        convertErrorCode(chunk.error.status),
                        chunk.error.message,
                        chunk.error.details
                      ))
                    }
                  } catch {
                    // Ignore parse errors at end
                  }
                }
                // Resolve with success if no result yet
                if (finalResult === undefined) {
                  resultResolve?.({ success: true } as ResponseData)
                }
                return { done: true, value: undefined as unknown as StreamData }
              }

              buffer += decoder.decode(value, { stream: true })
            }
          },

          async return(): Promise<IteratorResult<StreamData>> {
            done = true
            reader.cancel()
            return { done: true, value: undefined as unknown as StreamData }
          },
        }
      },
    }

    return {
      stream,
      data: resultPromise,
    }
  }

  return callable as HttpsCallable<RequestData, ResponseData, StreamData>
}

/**
 * Clear all Functions instances (for testing)
 */
export function clearFunctionsInstances(): void {
  functionsInstances.clear()
}
