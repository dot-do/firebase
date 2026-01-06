/**
 * RED Tests for Firebase Streaming Callable Function Protocol
 *
 * Tests for httpsCallable.stream() NDJSON responses.
 * These are failing tests that define the expected behavior for streaming
 * callable functions before the implementation exists.
 *
 * Firebase streaming callable functions use:
 * - POST requests with JSON body containing { "data": {...} }
 * - Responses use NDJSON (Newline Delimited JSON) format
 * - Each line is a JSON object: { "result": {...} } or { "message": {...} }
 * - Stream ends with a final result or error
 * - Content-Type: application/x-ndjson or text/event-stream for SSE
 *
 * @see https://firebase.google.com/docs/functions/callable-reference
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  handleStreamingCallable,
  registerStreamingFunction,
  clearStreamingFunctions,
  setProjectId,
  type CallableRequest,
  type StreamingCallableResponse,
  type StreamChunk,
} from '../../src/functions/streaming-callable'

// Test project ID for JWT verification
const TEST_PROJECT_ID = 'demo-project'

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

// Helper to collect all chunks from a stream
async function collectChunks(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

// Helper to parse NDJSON string into array of objects
function parseNDJSON(ndjson: string): unknown[] {
  return ndjson
    .trim()
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line))
}

describe('Firebase Streaming Callable Function Protocol', () => {
  beforeAll(() => {
    // Set project ID for JWT verification
    setProjectId(TEST_PROJECT_ID)

    // Register test streaming functions
    registerStreamingFunction('countStream', async function* (data: unknown) {
      const { count = 3 } = (data as { count?: number }) || {}
      for (let i = 1; i <= count; i++) {
        yield { value: i, total: count }
      }
    })

    registerStreamingFunction('progressStream', async function* (data: unknown) {
      const { steps = 5 } = (data as { steps?: number }) || {}
      for (let i = 0; i <= steps; i++) {
        yield { progress: (i / steps) * 100, step: i, total: steps }
      }
    })

    registerStreamingFunction('errorMidStream', async function* (data: unknown) {
      const { errorAtStep = 2 } = (data as { errorAtStep?: number }) || {}
      for (let i = 1; i <= 5; i++) {
        if (i === errorAtStep) {
          throw new Error('Intentional error during stream')
        }
        yield { value: i }
      }
    })

    registerStreamingFunction('emptyStream', async function* () {
      // Empty generator - yields nothing
    })

    registerStreamingFunction('singleChunkStream', async function* () {
      yield { message: 'Only one chunk' }
    })

    registerStreamingFunction('delayedStream', async function* (data: unknown) {
      const { delays = [10, 20, 30] } = (data as { delays?: number[] }) || {}
      for (const delay of delays) {
        await new Promise(resolve => setTimeout(resolve, delay))
        yield { delay, timestamp: Date.now() }
      }
    })

    registerStreamingFunction('largeChunkStream', async function* () {
      // Yield a large chunk to test buffering
      yield { data: 'x'.repeat(1024 * 100) } // 100KB chunk
    })

    registerStreamingFunction('metadataStream', async function* () {
      // Yield with metadata
      yield { type: 'start', timestamp: Date.now() }
      yield { type: 'data', payload: { foo: 'bar' } }
      yield { type: 'end', timestamp: Date.now() }
    })
  })

  afterAll(() => {
    clearStreamingFunctions()
  })

  describe('NDJSON Response Format', () => {
    it('should return Content-Type application/x-ndjson for streaming responses', async () => {
      const request = createRequest({
        body: { data: { count: 3 } },
      })

      const response = await handleStreamingCallable('countStream', request)

      expect(response.headers['content-type']).toBe('application/x-ndjson')
    })

    it('should return each chunk as a separate JSON line', async () => {
      const request = createRequest({
        body: { data: { count: 3 } },
      })

      const response = await handleStreamingCallable('countStream', request)
      const chunks = await collectChunks(response.stream)

      // 3 message chunks + 1 result chunk = 4 total
      expect(chunks).toHaveLength(4)
      // Check message chunks
      const messageChunks = chunks.filter(c => 'message' in c)
      expect(messageChunks).toHaveLength(3)
      messageChunks.forEach((chunk, index) => {
        expect(chunk).toEqual({
          message: { value: index + 1, total: 3 },
        })
      })
    })

    it('should wrap each yielded value in { message: ... } format', async () => {
      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleStreamingCallable('singleChunkStream', request)
      const chunks = await collectChunks(response.stream)

      expect(chunks[0]).toEqual({
        message: { message: 'Only one chunk' },
      })
    })

    it('should include final result chunk at end of stream', async () => {
      const request = createRequest({
        body: { data: { count: 2 } },
      })

      const response = await handleStreamingCallable('countStream', request)
      const chunks = await collectChunks(response.stream)

      // Last chunk should be the final result
      const lastChunk = chunks[chunks.length - 1]
      expect(lastChunk).toHaveProperty('result')
    })

    it('should serialize NDJSON output correctly', async () => {
      const request = createRequest({
        body: { data: { count: 2 } },
      })

      const response = await handleStreamingCallable('countStream', request)

      // Get raw NDJSON output
      const ndjsonOutput = await response.toNDJSON()
      const parsed = parseNDJSON(ndjsonOutput)

      expect(parsed.length).toBeGreaterThanOrEqual(2)
      parsed.forEach(obj => {
        expect(typeof obj).toBe('object')
      })
    })
  })

  describe('SSE (Server-Sent Events) Format', () => {
    it('should support text/event-stream Content-Type when requested', async () => {
      const request = createRequest({
        headers: {
          'content-type': 'application/json',
          'accept': 'text/event-stream',
        },
        body: { data: { count: 3 } },
      })

      const response = await handleStreamingCallable('countStream', request)

      expect(response.headers['content-type']).toBe('text/event-stream')
    })

    it('should format SSE responses with data: prefix', async () => {
      const request = createRequest({
        headers: {
          'content-type': 'application/json',
          'accept': 'text/event-stream',
        },
        body: { data: {} },
      })

      const response = await handleStreamingCallable('singleChunkStream', request)
      const sseOutput = await response.toSSE()

      expect(sseOutput).toContain('data: ')
      expect(sseOutput).toContain('\n\n')
    })

    it('should include event type in SSE output when specified', async () => {
      const request = createRequest({
        headers: {
          'content-type': 'application/json',
          'accept': 'text/event-stream',
        },
        body: { data: {} },
      })

      const response = await handleStreamingCallable('metadataStream', request)
      const sseOutput = await response.toSSE()

      expect(sseOutput).toMatch(/event: (message|result)/)
    })

    it('should terminate SSE with done event', async () => {
      const request = createRequest({
        headers: {
          'content-type': 'application/json',
          'accept': 'text/event-stream',
        },
        body: { data: { count: 1 } },
      })

      const response = await handleStreamingCallable('countStream', request)
      const sseOutput = await response.toSSE()

      expect(sseOutput).toContain('event: done')
    })
  })

  describe('Chunked Transfer Encoding', () => {
    it('should set Transfer-Encoding to chunked', async () => {
      const request = createRequest({
        body: { data: { count: 3 } },
      })

      const response = await handleStreamingCallable('countStream', request)

      expect(response.headers['transfer-encoding']).toBe('chunked')
    })

    it('should stream chunks as they become available', async () => {
      const request = createRequest({
        body: { data: { delays: [10, 20, 30] } },
      })

      const response = await handleStreamingCallable('delayedStream', request)
      const timestamps: number[] = []

      for await (const chunk of response.stream) {
        if ('message' in chunk) {
          timestamps.push(Date.now())
        }
      }

      // Verify chunks arrived at different times (with some tolerance)
      // Only count message chunks, not the final result chunk
      expect(timestamps.length).toBe(3)
      expect(timestamps[1] - timestamps[0]).toBeGreaterThan(5)
      expect(timestamps[2] - timestamps[1]).toBeGreaterThan(5)
    })

    it('should not buffer entire response before sending', async () => {
      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleStreamingCallable('largeChunkStream', request)

      // Should be able to get first chunk without waiting for entire stream
      const iterator = response.stream[Symbol.asyncIterator]()
      const firstChunk = await iterator.next()

      expect(firstChunk.done).toBe(false)
      expect(firstChunk.value).toHaveProperty('message')
    })
  })

  describe('Error Handling in Streams', () => {
    it('should send error chunk when stream throws', async () => {
      const request = createRequest({
        body: { data: { errorAtStep: 2 } },
      })

      const response = await handleStreamingCallable('errorMidStream', request)
      const chunks = await collectChunks(response.stream)

      // Should have received chunk 1, then error
      expect(chunks.some(c => 'error' in c)).toBe(true)
    })

    it('should include error code in error chunk', async () => {
      const request = createRequest({
        body: { data: { errorAtStep: 2 } },
      })

      const response = await handleStreamingCallable('errorMidStream', request)
      const chunks = await collectChunks(response.stream)
      const errorChunk = chunks.find(c => 'error' in c)

      expect(errorChunk).toBeDefined()
      expect(errorChunk?.error).toHaveProperty('status')
      expect(errorChunk?.error).toHaveProperty('message')
    })

    it('should map error codes to Firebase error codes', async () => {
      const request = createRequest({
        body: { data: { errorAtStep: 1 } },
      })

      const response = await handleStreamingCallable('errorMidStream', request)
      const chunks = await collectChunks(response.stream)
      const errorChunk = chunks.find(c => 'error' in c)

      expect(errorChunk?.error?.status).toBe('INTERNAL')
    })

    it('should terminate stream after error', async () => {
      const request = createRequest({
        body: { data: { errorAtStep: 2 } },
      })

      const response = await handleStreamingCallable('errorMidStream', request)
      const chunks = await collectChunks(response.stream)

      // Should not have more chunks after error
      const errorIndex = chunks.findIndex(c => 'error' in c)
      expect(errorIndex).toBe(chunks.length - 1)
    })

    it('should handle function not found for streaming', async () => {
      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleStreamingCallable('nonExistentStream', request)

      expect(response.status).toBe(404)
      expect(response.body).toEqual({
        error: {
          message: expect.stringContaining('not found'),
          status: 'NOT_FOUND',
        },
      })
    })

    it('should handle invalid request format for streaming', async () => {
      const request = createRequest({
        method: 'GET',
      })

      const response = await handleStreamingCallable('countStream', request)

      expect(response.status).toBe(405)
      expect(response.body).toEqual({
        error: {
          message: expect.any(String),
          status: 'INVALID_ARGUMENT',
        },
      })
    })

    it('should handle authentication errors before streaming starts', async () => {
      // Register an authenticated streaming function
      registerStreamingFunction('authStream', async function* (_data, context) {
        if (!context.auth) {
          throw new Error('UNAUTHENTICATED: Authentication required')
        }
        yield { authenticated: true }
      })

      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleStreamingCallable('authStream', request)
      const chunks = await collectChunks(response.stream)
      const errorChunk = chunks.find(c => 'error' in c)

      expect(errorChunk?.error?.status).toBe('UNAUTHENTICATED')
    })
  })

  describe('Empty and Edge Case Streams', () => {
    it('should handle empty stream (no yields)', async () => {
      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleStreamingCallable('emptyStream', request)
      const chunks = await collectChunks(response.stream)

      // Should have at least a final result chunk
      expect(chunks.some(c => 'result' in c)).toBe(true)
    })

    it('should handle single chunk stream', async () => {
      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleStreamingCallable('singleChunkStream', request)
      const chunks = await collectChunks(response.stream)

      expect(chunks.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle null yield values', async () => {
      registerStreamingFunction('nullStream', async function* () {
        yield null
        yield { after: 'null' }
      })

      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleStreamingCallable('nullStream', request)
      const chunks = await collectChunks(response.stream)

      expect(chunks.some(c => c.message === null)).toBe(true)
    })

    it('should handle undefined yield values', async () => {
      registerStreamingFunction('undefinedStream', async function* () {
        yield undefined
        yield { after: 'undefined' }
      })

      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleStreamingCallable('undefinedStream', request)
      const chunks = await collectChunks(response.stream)

      // undefined should be serialized appropriately (either omitted or as null)
      expect(chunks.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle large number of chunks', async () => {
      registerStreamingFunction('manyChunks', async function* () {
        for (let i = 0; i < 1000; i++) {
          yield { index: i }
        }
      })

      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleStreamingCallable('manyChunks', request)
      const chunks = await collectChunks(response.stream)

      expect(chunks.filter(c => 'message' in c)).toHaveLength(1000)
    })
  })

  describe('Stream Context and Metadata', () => {
    it('should provide stream context to streaming function', async () => {
      registerStreamingFunction('contextStream', async function* (_data, context) {
        yield { instanceId: context.instanceId }
        yield { hasAuth: context.auth !== null }
      })

      const request = createRequest({
        body: { data: {} },
      })

      const response = await handleStreamingCallable('contextStream', request)
      const chunks = await collectChunks(response.stream)

      const instanceIdChunk = chunks.find(c => c.message?.instanceId)
      expect(instanceIdChunk?.message?.instanceId).toBeDefined()
      expect(typeof instanceIdChunk?.message?.instanceId).toBe('string')
    })

    it('should include stream metadata in response headers', async () => {
      const request = createRequest({
        body: { data: { count: 3 } },
      })

      const response = await handleStreamingCallable('countStream', request)

      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.headers['x-content-type-options']).toBe('nosniff')
    })
  })

  describe('Abort and Cancellation', () => {
    it('should support stream cancellation via AbortSignal', async () => {
      const controller = new AbortController()
      const request = createRequest({
        body: { data: { delays: [100, 100, 100, 100] } },
        signal: controller.signal,
      })

      const response = await handleStreamingCallable('delayedStream', request)
      const chunks: StreamChunk[] = []

      // Cancel after receiving first chunk
      let chunkCount = 0
      try {
        for await (const chunk of response.stream) {
          chunks.push(chunk)
          chunkCount++
          if (chunkCount === 1) {
            controller.abort()
          }
        }
      } catch (error) {
        // Expected: stream should be aborted
      }

      expect(chunks.length).toBeLessThan(4)
    })

    it('should clean up resources when stream is cancelled', async () => {
      let cleanupCalled = false
      registerStreamingFunction('cleanupStream', async function* () {
        try {
          for (let i = 0; i < 100; i++) {
            yield { value: i }
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        } finally {
          cleanupCalled = true
        }
      })

      const controller = new AbortController()
      const request = createRequest({
        body: { data: {} },
        signal: controller.signal,
      })

      const response = await handleStreamingCallable('cleanupStream', request)
      const iterator = response.stream[Symbol.asyncIterator]()

      await iterator.next() // Get first chunk
      controller.abort()

      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(cleanupCalled).toBe(true)
    })
  })

  describe('CORS for Streaming', () => {
    it('should set CORS headers for streaming responses', async () => {
      const request = createRequest({
        body: { data: { count: 1 } },
      })

      const response = await handleStreamingCallable('countStream', request)

      expect(response.headers['access-control-allow-origin']).toBeDefined()
    })

    it('should handle preflight for streaming endpoints', async () => {
      const request: CallableRequest = {
        method: 'OPTIONS',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'POST',
        },
        body: null,
      }

      const response = await handleStreamingCallable('countStream', request)

      expect(response.status).toBe(204)
      expect(response.headers['access-control-allow-methods']).toContain('POST')
    })
  })

  describe('Integration with Regular Callable', () => {
    it('should coexist with non-streaming callable functions', async () => {
      // Both regular and streaming functions should work in the same codebase
      const streamingRequest = createRequest({
        body: { data: { count: 2 } },
      })

      const streamResponse = await handleStreamingCallable('countStream', streamingRequest)
      expect(streamResponse.headers['content-type']).toBe('application/x-ndjson')

      const chunks = await collectChunks(streamResponse.stream)
      expect(chunks.length).toBeGreaterThan(0)
    })
  })
})
