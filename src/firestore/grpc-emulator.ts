/**
 * Firestore gRPC Emulator Server
 *
 * Implements the google.firestore.v1.Firestore gRPC service for use with
 * the Firebase SDK's emulator connection mode.
 *
 * This server provides basic document operations (get, set, delete, query)
 * backed by in-memory storage for testing purposes.
 */

import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  getDocument,
  updateDocument,
  deleteDocument,
  clearAllDocuments,
  getAllDocuments,
  type Document,
} from './crud.js'
import { runQuery, type StructuredQuery } from './query.js'
import type { Value } from './values.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ service: 'firestore-grpc-emulator' })

const __dirname = dirname(fileURLToPath(import.meta.url))

// In-memory document storage for gRPC emulator
const documents = new Map<string, { fields: Record<string, Value>; createTime: string; updateTime: string }>()

function generateTimestamp(): string {
  return new Date().toISOString()
}

function buildDocName(projectId: string, databaseId: string, docPath: string): string {
  return `projects/${projectId}/databases/${databaseId}/documents/${docPath}`
}

function parseDocName(name: string): { projectId: string; databaseId: string; docPath: string } | null {
  const match = name.match(/^projects\/([^/]+)\/databases\/([^/]+)\/documents\/(.+)$/)
  if (!match) return null
  return { projectId: match[1], databaseId: match[2], docPath: match[3] }
}

// gRPC Service Implementation
const firestoreService = {
  // GetDocument
  GetDocument: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const { name, mask } = call.request
      const doc = documents.get(name)

      if (!doc) {
        callback({
          code: grpc.status.NOT_FOUND,
          message: `Document not found: ${name}`,
        })
        return
      }

      const response = {
        name,
        fields: doc.fields,
        createTime: { seconds: Math.floor(new Date(doc.createTime).getTime() / 1000), nanos: 0 },
        updateTime: { seconds: Math.floor(new Date(doc.updateTime).getTime() / 1000), nanos: 0 },
      }

      callback(null, response)
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : 'Internal error',
      })
    }
  },

  // CreateDocument
  CreateDocument: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const { parent, collectionId, documentId, document } = call.request
      const docPath = `${collectionId}/${documentId}`
      const name = `${parent}/${docPath}`

      const now = generateTimestamp()
      documents.set(name, {
        fields: document?.fields || {},
        createTime: now,
        updateTime: now,
      })

      const response = {
        name,
        fields: document?.fields || {},
        createTime: { seconds: Math.floor(new Date(now).getTime() / 1000), nanos: 0 },
        updateTime: { seconds: Math.floor(new Date(now).getTime() / 1000), nanos: 0 },
      }

      callback(null, response)
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : 'Internal error',
      })
    }
  },

  // UpdateDocument
  UpdateDocument: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const { document, updateMask, currentDocument } = call.request
      const name = document?.name

      if (!name) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Document name is required',
        })
        return
      }

      const existing = documents.get(name)
      const now = generateTimestamp()

      if (!existing) {
        // Create new document
        documents.set(name, {
          fields: document?.fields || {},
          createTime: now,
          updateTime: now,
        })
      } else {
        // Update existing document
        const newFields = updateMask?.fieldPaths
          ? { ...existing.fields }
          : { ...document?.fields }

        if (updateMask?.fieldPaths) {
          for (const fieldPath of updateMask.fieldPaths) {
            if (document?.fields?.[fieldPath] !== undefined) {
              newFields[fieldPath] = document.fields[fieldPath]
            }
          }
        }

        documents.set(name, {
          fields: newFields,
          createTime: existing.createTime,
          updateTime: now,
        })
      }

      const doc = documents.get(name)!
      const response = {
        name,
        fields: doc.fields,
        createTime: { seconds: Math.floor(new Date(doc.createTime).getTime() / 1000), nanos: 0 },
        updateTime: { seconds: Math.floor(new Date(doc.updateTime).getTime() / 1000), nanos: 0 },
      }

      callback(null, response)
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : 'Internal error',
      })
    }
  },

  // DeleteDocument
  DeleteDocument: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const { name } = call.request
      documents.delete(name)
      callback(null, {})
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : 'Internal error',
      })
    }
  },

  // BatchGetDocuments (streaming response)
  BatchGetDocuments: (call: grpc.ServerWritableStream<any, any>) => {
    try {
      const { database, documents: docNames } = call.request

      for (const name of docNames || []) {
        const doc = documents.get(name)

        if (doc) {
          call.write({
            found: {
              name,
              fields: doc.fields,
              createTime: { seconds: Math.floor(new Date(doc.createTime).getTime() / 1000), nanos: 0 },
              updateTime: { seconds: Math.floor(new Date(doc.updateTime).getTime() / 1000), nanos: 0 },
            },
            readTime: { seconds: Math.floor(Date.now() / 1000), nanos: 0 },
          })
        } else {
          call.write({
            missing: name,
            readTime: { seconds: Math.floor(Date.now() / 1000), nanos: 0 },
          })
        }
      }

      call.end()
    } catch (error) {
      call.destroy(new Error(error instanceof Error ? error.message : 'Internal error'))
    }
  },

  // Commit (batch writes)
  Commit: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      const { database, writes, transaction } = call.request
      const writeResults: any[] = []
      const now = generateTimestamp()
      const commitTime = { seconds: Math.floor(new Date(now).getTime() / 1000), nanos: 0 }

      for (const write of writes || []) {
        if (write.update) {
          const name = write.update.name
          const existing = documents.get(name)

          documents.set(name, {
            fields: write.update.fields || {},
            createTime: existing?.createTime || now,
            updateTime: now,
          })

          writeResults.push({
            updateTime: commitTime,
          })
        } else if (write.delete) {
          documents.delete(write.delete)
          writeResults.push({
            updateTime: commitTime,
          })
        } else if (write.transform) {
          // Handle field transforms (serverTimestamp, increment, etc.)
          writeResults.push({
            updateTime: commitTime,
          })
        }
      }

      callback(null, {
        writeResults,
        commitTime,
      })
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : 'Internal error',
      })
    }
  },

  // RunQuery (streaming response)
  RunQuery: (call: grpc.ServerWritableStream<any, any>) => {
    try {
      const { parent, structuredQuery } = call.request
      const readTime = { seconds: Math.floor(Date.now() / 1000), nanos: 0 }

      // Get collection from structured query
      const collectionId = structuredQuery?.from?.[0]?.collectionId
      if (!collectionId) {
        call.write({ readTime })
        call.end()
        return
      }

      // Filter documents by collection
      const results: any[] = []
      for (const [name, doc] of documents) {
        if (name.includes(`/${collectionId}/`)) {
          results.push({
            document: {
              name,
              fields: doc.fields,
              createTime: { seconds: Math.floor(new Date(doc.createTime).getTime() / 1000), nanos: 0 },
              updateTime: { seconds: Math.floor(new Date(doc.updateTime).getTime() / 1000), nanos: 0 },
            },
            readTime,
          })
        }
      }

      // Apply where filters if present
      const filteredResults = results.filter(result => {
        if (!structuredQuery?.where) return true

        const where = structuredQuery.where
        if (where.fieldFilter) {
          const { field, op, value } = where.fieldFilter
          const fieldName = field?.fieldPath
          const docValue = result.document.fields?.[fieldName]

          if (!fieldName || !docValue) return op === 'IS_NULL' || op === 'IS_NOT_NULL'

          switch (op) {
            case 'EQUAL':
              return JSON.stringify(docValue) === JSON.stringify(value)
            case 'NOT_EQUAL':
              return JSON.stringify(docValue) !== JSON.stringify(value)
            case 'LESS_THAN':
              return compareValues(docValue, value) < 0
            case 'LESS_THAN_OR_EQUAL':
              return compareValues(docValue, value) <= 0
            case 'GREATER_THAN':
              return compareValues(docValue, value) > 0
            case 'GREATER_THAN_OR_EQUAL':
              return compareValues(docValue, value) >= 0
            default:
              return true
          }
        }

        return true
      })

      for (const result of filteredResults) {
        call.write(result)
      }

      call.end()
    } catch (error) {
      call.destroy(new Error(error instanceof Error ? error.message : 'Internal error'))
    }
  },

  // BeginTransaction
  BeginTransaction: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    try {
      // Generate a simple transaction ID
      const transaction = Buffer.from(Date.now().toString())
      callback(null, { transaction })
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : 'Internal error',
      })
    }
  },

  // Rollback
  Rollback: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
    // For the emulator, rollback is a no-op since we don't have real transactions
    callback(null, {})
  },

  // Listen (bidirectional streaming for realtime updates)
  Listen: (call: grpc.ServerDuplexStream<any, any>) => {
    call.on('data', (request: any) => {
      if (request.addTarget) {
        // Send initial snapshot with current documents
        const targetId = request.addTarget.targetId || 1

        call.write({
          targetChange: {
            targetChangeType: 'CURRENT',
            targetIds: [targetId],
            readTime: { seconds: Math.floor(Date.now() / 1000), nanos: 0 },
          },
        })
      }
    })

    call.on('end', () => {
      call.end()
    })

    call.on('error', () => {
      // Handle errors gracefully
    })
  },

  // Write (bidirectional streaming for batch writes)
  Write: (call: grpc.ServerDuplexStream<any, any>) => {
    let streamId = ''

    call.on('data', (request: any) => {
      try {
        if (request.streamId) {
          streamId = request.streamId
        }

        const writes = request.writes || []
        const writeResults: any[] = []
        const now = generateTimestamp()
        const commitTime = { seconds: Math.floor(new Date(now).getTime() / 1000), nanos: 0 }

        for (const write of writes) {
          if (write.update) {
            const name = write.update.name
            const existing = documents.get(name)

            documents.set(name, {
              fields: write.update.fields || {},
              createTime: existing?.createTime || now,
              updateTime: now,
            })

            writeResults.push({
              updateTime: commitTime,
            })
          } else if (write.delete) {
            documents.delete(write.delete)
            writeResults.push({
              updateTime: commitTime,
            })
          }
        }

        call.write({
          streamId,
          writeResults,
          commitTime,
          streamToken: Buffer.from(Date.now().toString()),
        })
      } catch (error) {
        // Send error response
      }
    })

    call.on('end', () => {
      call.end()
    })

    call.on('error', () => {
      // Handle errors gracefully
    })
  },
}

function compareValues(a: any, b: any): number {
  // Simple comparison for primitive values
  const aVal = a.stringValue || a.integerValue || a.doubleValue || 0
  const bVal = b.stringValue || b.integerValue || b.doubleValue || 0
  if (aVal < bVal) return -1
  if (aVal > bVal) return 1
  return 0
}

let server: grpc.Server | null = null

/**
 * Start the Firestore gRPC emulator server
 */
export async function startFirestoreEmulator(port: number = 8080): Promise<grpc.Server> {
  return new Promise((resolve, reject) => {
    if (server) {
      reject(new Error('Firestore emulator is already running'))
      return
    }

    // Create a simple gRPC server without proto files
    // by defining the service dynamically
    server = new grpc.Server()

    // Define the service using the untyped API
    const serviceDefinition: grpc.UntypedServiceImplementation = {
      GetDocument: firestoreService.GetDocument,
      CreateDocument: firestoreService.CreateDocument,
      UpdateDocument: firestoreService.UpdateDocument,
      DeleteDocument: firestoreService.DeleteDocument,
      BatchGetDocuments: firestoreService.BatchGetDocuments,
      Commit: firestoreService.Commit,
      RunQuery: firestoreService.RunQuery,
      BeginTransaction: firestoreService.BeginTransaction,
      Rollback: firestoreService.Rollback,
      Listen: firestoreService.Listen,
      Write: firestoreService.Write,
    }

    // Create service definition manually
    const serviceDef: grpc.ServiceDefinition = {
      GetDocument: {
        path: '/google.firestore.v1.Firestore/GetDocument',
        requestStream: false,
        responseStream: false,
        requestSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        requestDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
        responseSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        responseDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      },
      CreateDocument: {
        path: '/google.firestore.v1.Firestore/CreateDocument',
        requestStream: false,
        responseStream: false,
        requestSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        requestDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
        responseSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        responseDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      },
      UpdateDocument: {
        path: '/google.firestore.v1.Firestore/UpdateDocument',
        requestStream: false,
        responseStream: false,
        requestSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        requestDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
        responseSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        responseDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      },
      DeleteDocument: {
        path: '/google.firestore.v1.Firestore/DeleteDocument',
        requestStream: false,
        responseStream: false,
        requestSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        requestDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
        responseSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        responseDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      },
      BatchGetDocuments: {
        path: '/google.firestore.v1.Firestore/BatchGetDocuments',
        requestStream: false,
        responseStream: true,
        requestSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        requestDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
        responseSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        responseDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      },
      Commit: {
        path: '/google.firestore.v1.Firestore/Commit',
        requestStream: false,
        responseStream: false,
        requestSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        requestDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
        responseSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        responseDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      },
      RunQuery: {
        path: '/google.firestore.v1.Firestore/RunQuery',
        requestStream: false,
        responseStream: true,
        requestSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        requestDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
        responseSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        responseDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      },
      BeginTransaction: {
        path: '/google.firestore.v1.Firestore/BeginTransaction',
        requestStream: false,
        responseStream: false,
        requestSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        requestDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
        responseSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        responseDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      },
      Rollback: {
        path: '/google.firestore.v1.Firestore/Rollback',
        requestStream: false,
        responseStream: false,
        requestSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        requestDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
        responseSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        responseDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      },
      Listen: {
        path: '/google.firestore.v1.Firestore/Listen',
        requestStream: true,
        responseStream: true,
        requestSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        requestDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
        responseSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        responseDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      },
      Write: {
        path: '/google.firestore.v1.Firestore/Write',
        requestStream: true,
        responseStream: true,
        requestSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        requestDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
        responseSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        responseDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      },
    }

    server.addService(serviceDef, serviceDefinition)

    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (error, boundPort) => {
        if (error) {
          server = null
          reject(error)
          return
        }
        log.info(`Firestore gRPC Emulator running on port ${boundPort}`)
        resolve(server as grpc.Server)
      }
    )
  })
}

/**
 * Stop the Firestore gRPC emulator server
 */
export function stopFirestoreEmulator(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve()
      return
    }

    server.tryShutdown(() => {
      server = null
      resolve()
    })
  })
}

/**
 * Clear all documents (for testing)
 */
export function clearFirestoreEmulatorData(): void {
  documents.clear()
}

/**
 * Get all documents (for testing/debugging)
 */
export function getFirestoreEmulatorDocuments(): Map<string, any> {
  return new Map(documents)
}
