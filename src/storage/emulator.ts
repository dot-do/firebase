/**
 * Firebase Storage HTTP Emulator Server
 *
 * Implements the Firebase Storage REST API for emulator usage.
 * Provides basic object operations backed by in-memory storage.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import {
  uploadObject,
  downloadObject,
  deleteObject,
  getMetadata,
  listObjects,
  StorageError,
  StorageErrorCode,
} from './objects.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ service: 'storage-emulator' })

let server: Server | null = null

// In-memory storage for emulator
const storage = new Map<string, Map<string, { data: Buffer; contentType: string; metadata: Record<string, string> }>>()

function getBucket(bucketName: string): Map<string, { data: Buffer; contentType: string; metadata: Record<string, string> }> {
  if (!storage.has(bucketName)) {
    storage.set(bucketName, new Map())
  }
  return storage.get(bucketName)!
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Parse multipart/related body for Firebase SDK uploads
 * The Firebase SDK sends uploads as multipart/related with:
 * - First part: JSON metadata
 * - Second part: File content
 */
function parseMultipartBody(
  body: Buffer,
  contentType: string
): { metadata: Record<string, any>; data: Buffer; fileContentType: string } {
  // Extract boundary from content type
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/)
  if (!boundaryMatch) {
    // Not multipart, return as-is
    return { metadata: {}, data: body, fileContentType: 'application/octet-stream' }
  }

  const boundary = boundaryMatch[1]
  const bodyStr = body.toString('utf-8')

  // Split by boundary
  const parts = bodyStr.split(`--${boundary}`)

  let metadata: Record<string, any> = {}
  let data = body
  let fileContentType = 'application/octet-stream'
  let foundContentPart = false

  for (const part of parts) {
    if (!part.trim() || part.trim() === '--') continue

    // Split headers from content (double newline)
    const headerEndIndex = part.indexOf('\r\n\r\n')
    if (headerEndIndex === -1) continue

    const headersStr = part.substring(0, headerEndIndex)
    let content = part.substring(headerEndIndex + 4)

    // Parse headers
    const headers: Record<string, string> = {}
    for (const line of headersStr.split('\r\n')) {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim().toLowerCase()
        const value = line.substring(colonIndex + 1).trim()
        headers[key] = value
      }
    }

    const partContentType = headers['content-type'] || ''

    if (partContentType.includes('application/json')) {
      // This is the metadata part
      try {
        // Remove trailing boundary and whitespace (including \r\n before boundary)
        const jsonStr = content.replace(/\r?\n?--.*$/s, '').trim()
        metadata = JSON.parse(jsonStr)
      } catch {
        // Ignore parse errors
      }
    } else if (partContentType || (!foundContentPart && !partContentType.includes('application/json'))) {
      // This is the file content part
      foundContentPart = true
      if (partContentType) {
        fileContentType = partContentType.split(';')[0].trim()
      }
      // Remove trailing boundary and any trailing CRLF before it
      // The format is: content\r\n--boundary
      content = content.replace(/\r?\n?--[^\r\n]*(\r?\n--)?$/s, '')
      data = Buffer.from(content, 'utf-8')
    }
  }

  // Use contentType from metadata if available - this takes priority
  if (metadata.contentType) {
    fileContentType = metadata.contentType
  }

  return { metadata, data, fileContentType }
}

function sendJson(res: ServerResponse, statusCode: number, data: any): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Length, X-Goog-Upload-Protocol, X-Goog-Upload-Command, X-Goog-Upload-Offset')
  res.end(JSON.stringify(data))
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, {
    error: {
      code: statusCode,
      message,
    },
  })
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const pathname = url.pathname
  const method = req.method || 'GET'

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Content-Length, X-Goog-Upload-Protocol, X-Goog-Upload-Command, X-Goog-Upload-Offset',
      'Access-Control-Max-Age': '3600',
    })
    res.end()
    return
  }

  try {
    // Parse path: /v0/b/{bucket}/o/{object}
    const match = pathname.match(/^\/v0\/b\/([^/]+)\/o(?:\/(.*))?$/)
    if (!match) {
      // Health check endpoint
      if (pathname === '/' || pathname === '/health') {
        sendJson(res, 200, { status: 'ok', service: 'storage-emulator' })
        return
      }
      sendError(res, 404, 'Not Found')
      return
    }

    const bucketName = decodeURIComponent(match[1])
    const objectPath = match[2] ? decodeURIComponent(match[2]) : ''
    const bucket = getBucket(bucketName)

    // List objects
    if (method === 'GET' && !objectPath) {
      const prefix = url.searchParams.get('prefix') || ''
      const delimiter = url.searchParams.get('delimiter') || ''
      const maxResults = parseInt(url.searchParams.get('maxResults') || '1000')

      const items: any[] = []
      const prefixes = new Set<string>()

      for (const [path, obj] of bucket) {
        if (prefix && !path.startsWith(prefix)) continue

        if (delimiter) {
          const afterPrefix = prefix ? path.slice(prefix.length) : path
          const delimIndex = afterPrefix.indexOf(delimiter)
          if (delimIndex !== -1) {
            prefixes.add((prefix || '') + afterPrefix.slice(0, delimIndex + 1))
            continue
          }
        }

        items.push({
          name: path,
          bucket: bucketName,
          contentType: obj.contentType,
          size: obj.data.length.toString(),
          metadata: obj.metadata,
        })

        if (items.length >= maxResults) break
      }

      sendJson(res, 200, {
        items,
        prefixes: Array.from(prefixes),
      })
      return
    }

    // Get object or metadata
    if (method === 'GET' && objectPath) {
      const obj = bucket.get(objectPath)
      if (!obj) {
        sendError(res, 404, 'Object not found')
        return
      }

      // Check if metadata only
      const alt = url.searchParams.get('alt')
      if (alt !== 'media') {
        sendJson(res, 200, {
          name: objectPath,
          bucket: bucketName,
          contentType: obj.contentType,
          size: obj.data.length.toString(),
          metadata: obj.metadata,
          downloadTokens: 'emulator-token',
        })
        return
      }

      // Download object
      res.statusCode = 200
      res.setHeader('Content-Type', obj.contentType)
      res.setHeader('Content-Length', obj.data.length)
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.end(obj.data)
      return
    }

    // Upload object (multipart or resumable)
    if (method === 'POST' && !objectPath) {
      const uploadType = url.searchParams.get('uploadType')
      const name = url.searchParams.get('name')

      if (!name) {
        sendError(res, 400, 'Object name is required')
        return
      }

      const body = await readBody(req)
      const reqContentType = req.headers['content-type'] || 'application/octet-stream'

      let data: Buffer
      let contentType: string
      let customMetadata: Record<string, string> = {}

      // Handle multipart/related uploads from Firebase SDK
      if (reqContentType.includes('multipart/related')) {
        const parsed = parseMultipartBody(body, reqContentType)
        data = parsed.data
        contentType = parsed.fileContentType
        customMetadata = parsed.metadata.customMetadata || {}
      } else {
        data = body
        contentType = reqContentType.split(';')[0]
      }

      bucket.set(name, {
        data,
        contentType,
        metadata: customMetadata,
      })

      sendJson(res, 200, {
        name,
        bucket: bucketName,
        contentType,
        size: data.length.toString(),
        metadata: customMetadata,
        downloadTokens: 'emulator-token',
      })
      return
    }

    // Upload via PUT (for uploadString etc.)
    if (method === 'PUT' && objectPath) {
      const body = await readBody(req)
      const reqContentType = req.headers['content-type'] || 'text/plain'

      let data: Buffer
      let contentType: string
      let customMetadata: Record<string, string> = {}

      // Handle multipart/related uploads from Firebase SDK
      if (reqContentType.includes('multipart/related')) {
        const parsed = parseMultipartBody(body, reqContentType)
        data = parsed.data
        contentType = parsed.fileContentType
        customMetadata = parsed.metadata.customMetadata || {}
      } else {
        data = body
        contentType = reqContentType.split(';')[0]
      }

      bucket.set(objectPath, {
        data,
        contentType,
        metadata: customMetadata,
      })

      sendJson(res, 200, {
        name: objectPath,
        bucket: bucketName,
        contentType,
        size: data.length.toString(),
        metadata: customMetadata,
        downloadTokens: 'emulator-token',
      })
      return
    }

    // Update metadata via PATCH
    if (method === 'PATCH' && objectPath) {
      const obj = bucket.get(objectPath)
      if (!obj) {
        sendError(res, 404, 'Object not found')
        return
      }

      const body = await readBody(req)
      let updates: Record<string, any> = {}
      try {
        updates = JSON.parse(body.toString('utf-8'))
      } catch {
        sendError(res, 400, 'Invalid JSON')
        return
      }

      // Update the object
      if (updates.contentType) {
        obj.contentType = updates.contentType
      }
      if (updates.customMetadata) {
        obj.metadata = { ...obj.metadata, ...updates.customMetadata }
      }

      sendJson(res, 200, {
        name: objectPath,
        bucket: bucketName,
        contentType: obj.contentType,
        size: obj.data.length.toString(),
        metadata: obj.metadata,
        downloadTokens: 'emulator-token',
      })
      return
    }

    // Delete object
    if (method === 'DELETE' && objectPath) {
      if (!bucket.has(objectPath)) {
        sendError(res, 404, 'Object not found')
        return
      }

      bucket.delete(objectPath)
      sendJson(res, 200, {})
      return
    }

    sendError(res, 405, 'Method not allowed')
  } catch (error) {
    log.error('Storage emulator error', error instanceof Error ? error : undefined)
    sendError(res, 500, error instanceof Error ? error.message : 'Internal server error')
  }
}

/**
 * Start the Storage HTTP emulator server
 */
export function startStorageEmulator(port: number = 9199): Promise<Server> {
  return new Promise((resolve, reject) => {
    if (server) {
      reject(new Error('Storage emulator is already running'))
      return
    }

    server = createServer(handleRequest)

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        log.info(`Storage emulator port ${port} already in use, assuming emulator is running`)
        server = null
        resolve(server as any)
      } else {
        reject(error)
      }
    })

    server.listen(port, () => {
      log.info(`Storage Emulator running on http://localhost:${port}`)
      resolve(server as Server)
    })
  })
}

/**
 * Stop the Storage HTTP emulator server
 */
export function stopStorageEmulator(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve()
      return
    }

    server.close((err) => {
      server = null
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

/**
 * Clear all storage data (for testing)
 */
export function clearStorageEmulatorData(): void {
  storage.clear()
}
