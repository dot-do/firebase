/**
 * Firestore REST API HTTP Server
 *
 * Implements the Firestore v1 REST API for document CRUD operations
 * https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import {
  getDocument,
  updateDocument,
  deleteDocument,
  buildDocumentPath,
  parseDocumentPath,
  isValidDocumentPath,
  clearAllDocuments,
  type Document,
  type FirestoreError,
  type GetDocumentOptions,
  type UpdateDocumentOptions,
  type DeleteDocumentOptions,
  type Precondition,
} from './crud'

/**
 * Parse query parameters from URL
 */
function parseQueryParams(url: string): URLSearchParams {
  const urlObj = new URL(url, 'http://localhost')
  return urlObj.searchParams
}

/**
 * Parse document path from URL
 * /v1/projects/{project}/databases/{db}/documents/{collection}/{docId}/...
 */
function parseUrlPath(url: string): {
  projectId: string
  databaseId: string
  documentPath: string
} | null {
  const regex = /^\/v1\/projects\/([^/]+)\/databases\/([^/]+)\/documents\/(.+)$/
  const match = url.split('?')[0].match(regex)

  if (!match) {
    return null
  }

  return {
    projectId: match[1],
    databaseId: match[2],
    documentPath: match[3],
  }
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

/**
 * Send error response
 */
function sendError(
  res: ServerResponse,
  statusCode: number,
  status: string,
  message: string
): void {
  const error: FirestoreError = {
    error: {
      code: statusCode,
      message,
      status,
    },
  }
  sendJson(res, statusCode, error)
}

/**
 * Read request body
 */
async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      resolve(body)
    })
    req.on('error', reject)
  })
}

/**
 * Handle GET document request
 */
async function handleGet(
  req: IncomingMessage,
  res: ServerResponse,
  fullDocPath: string,
  queryParams: URLSearchParams
): Promise<void> {
  // Validate document path
  if (!isValidDocumentPath(fullDocPath)) {
    sendError(res, 400, 'INVALID_ARGUMENT', 'Invalid document path')
    return
  }

  // Parse field mask
  const maskParams = queryParams.getAll('mask.fieldPaths')
  const options: GetDocumentOptions = {}
  if (maskParams.length > 0) {
    options.mask = maskParams
  }

  // Get document
  const doc = getDocument(fullDocPath, options)

  if (!doc) {
    sendError(res, 404, 'NOT_FOUND', 'Document not found')
    return
  }

  sendJson(res, 200, doc)
}

/**
 * Handle PATCH document request (create or update)
 */
async function handlePatch(
  req: IncomingMessage,
  res: ServerResponse,
  fullDocPath: string,
  queryParams: URLSearchParams
): Promise<void> {
  // Validate document path
  if (!isValidDocumentPath(fullDocPath)) {
    sendError(res, 400, 'INVALID_ARGUMENT', 'Invalid document path')
    return
  }

  // Read and parse body
  let body: string
  try {
    body = await readBody(req)
  } catch (error) {
    sendError(res, 400, 'INVALID_ARGUMENT', 'Failed to read request body')
    return
  }

  let docData: { fields?: Record<string, unknown> }
  try {
    docData = JSON.parse(body)
  } catch (error) {
    sendError(res, 400, 'INVALID_ARGUMENT', 'Invalid JSON in request body')
    return
  }

  // Parse options
  const options: UpdateDocumentOptions = {}

  // Parse update mask
  const updateMaskParams = queryParams.getAll('updateMask.fieldPaths')
  if (updateMaskParams.length > 0) {
    options.updateMask = updateMaskParams
  }

  // Parse preconditions
  const existsParam = queryParams.get('currentDocument.exists')
  const updateTimeParam = queryParams.get('currentDocument.updateTime')

  if (existsParam !== null || updateTimeParam !== null) {
    options.currentDocument = {} as Precondition

    if (existsParam !== null) {
      options.currentDocument.exists = existsParam === 'true'
    }

    if (updateTimeParam !== null) {
      options.currentDocument.updateTime = decodeURIComponent(updateTimeParam)
    }
  }

  // Validate field values
  if (docData.fields) {
    const validationError = validateFields(docData.fields)
    if (validationError) {
      sendError(res, 400, 'INVALID_ARGUMENT', validationError)
      return
    }
  }

  // Update document
  try {
    const doc = updateDocument(fullDocPath, docData.fields || {}, options)
    sendJson(res, 200, doc)
  } catch (error: any) {
    if (error.firestoreError) {
      const firestoreError = error.firestoreError as FirestoreError
      sendJson(res, firestoreError.error.code, firestoreError)
    } else {
      sendError(res, 500, 'INTERNAL', 'Internal server error')
    }
  }
}

/**
 * Handle DELETE document request
 */
async function handleDelete(
  req: IncomingMessage,
  res: ServerResponse,
  fullDocPath: string,
  queryParams: URLSearchParams
): Promise<void> {
  // Validate document path
  if (!isValidDocumentPath(fullDocPath)) {
    sendError(res, 400, 'INVALID_ARGUMENT', 'Invalid document path')
    return
  }

  // Parse preconditions
  const options: DeleteDocumentOptions = {}
  const existsParam = queryParams.get('currentDocument.exists')
  const updateTimeParam = queryParams.get('currentDocument.updateTime')

  if (existsParam !== null || updateTimeParam !== null) {
    options.currentDocument = {} as Precondition

    if (existsParam !== null) {
      options.currentDocument.exists = existsParam === 'true'
    }

    if (updateTimeParam !== null) {
      options.currentDocument.updateTime = decodeURIComponent(updateTimeParam)
    }
  }

  // Delete document
  try {
    const deleted = deleteDocument(fullDocPath, options)

    if (!deleted) {
      sendError(res, 404, 'NOT_FOUND', 'Document not found')
      return
    }

    // Return empty object on success
    sendJson(res, 200, {})
  } catch (error: any) {
    if (error.firestoreError) {
      const firestoreError = error.firestoreError as FirestoreError
      sendJson(res, firestoreError.error.code, firestoreError)
    } else {
      sendError(res, 500, 'INTERNAL', 'Internal server error')
    }
  }
}

/**
 * Validate field values (basic validation for known value types)
 */
function validateFields(fields: Record<string, any>): string | null {
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== 'object' || value === null) {
      return `Invalid field value for ${key}: must be an object`
    }

    const valueTypes = [
      'stringValue',
      'integerValue',
      'doubleValue',
      'booleanValue',
      'nullValue',
      'timestampValue',
      'bytesValue',
      'referenceValue',
      'geoPointValue',
      'arrayValue',
      'mapValue',
    ]

    const hasValidType = valueTypes.some((type) => type in value)
    if (!hasValidType) {
      return `Invalid field value for ${key}: unknown value type`
    }

    // Recursively validate map fields
    if (value.mapValue?.fields) {
      const nestedError = validateFields(value.mapValue.fields)
      if (nestedError) {
        return nestedError
      }
    }

    // Recursively validate array values
    if (value.arrayValue?.values) {
      for (const arrayItem of value.arrayValue.values) {
        const tempObj = { temp: arrayItem }
        const arrayError = validateFields(tempObj)
        if (arrayError) {
          return arrayError.replace('temp', `${key}[item]`)
        }
      }
    }
  }

  return null
}

/**
 * Request handler
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url || '/'
  const method = req.method || 'GET'

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (method === 'OPTIONS') {
    res.statusCode = 200
    res.end()
    return
  }

  // Parse URL
  const pathInfo = parseUrlPath(url)

  if (!pathInfo) {
    sendError(res, 404, 'NOT_FOUND', 'Invalid API endpoint')
    return
  }

  // Build full document path
  const fullDocPath = buildDocumentPath(
    pathInfo.projectId,
    pathInfo.databaseId,
    pathInfo.documentPath
  )

  // Parse query parameters
  const queryParams = parseQueryParams(url)

  // Route to handler
  try {
    if (method === 'GET') {
      await handleGet(req, res, fullDocPath, queryParams)
    } else if (method === 'PATCH') {
      await handlePatch(req, res, fullDocPath, queryParams)
    } else if (method === 'DELETE') {
      await handleDelete(req, res, fullDocPath, queryParams)
    } else {
      sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${method} not allowed`)
    }
  } catch (error: any) {
    console.error('Request handler error:', error)
    sendError(res, 500, 'INTERNAL', error.message || 'Internal server error')
  }
}

/**
 * Create and start the server
 */
export function startServer(port: number = 8080): Server {
  const server = createServer(handleRequest)
  server.listen(port)
  return server
}

/**
 * Stop the server
 */
export function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

/**
 * Clear all documents (for testing)
 */
export { clearAllDocuments }
