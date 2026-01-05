/**
 * Test setup for Firestore integration tests
 * Starts the HTTP server before tests and stops it after
 */

import { beforeAll, afterAll } from 'vitest'
import { startServer, stopServer, clearAllDocuments } from '../../src/firestore/server'
import type { Server } from 'http'

let server: Server | null = null

beforeAll(() => {
  // Start server on port 8080
  server = startServer(8080)
  console.log('Firestore test server started on port 8080')
})

afterAll(async () => {
  // Stop server
  if (server) {
    await stopServer(server)
    console.log('Firestore test server stopped')
  }
})
