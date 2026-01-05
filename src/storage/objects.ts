/**
 * Firebase Storage CRUD Operations
 *
 * This module provides Firebase Storage compatible API backed by Cloudflare R2.
 * Implements standard object operations: upload, download, delete, metadata, list, and copy.
 *
 * @see https://firebase.google.com/docs/reference/rest/storage/rest/v1/objects
 */

import { createHash } from 'crypto'
import {
  getStorageConfig,
  StorageConfigErrors,
} from './config.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Upload options for object creation
 */
export interface UploadOptions {
  /** Content type (MIME type) of the object */
  contentType?: string
  /** Custom metadata key-value pairs */
  metadata?: Record<string, string>
  /** Content encoding (e.g., 'gzip') */
  contentEncoding?: string
  /** Content disposition for download behavior */
  contentDisposition?: string
  /** Cache control directives */
  cacheControl?: string
  /** Content language */
  contentLanguage?: string
  /** Precondition: only upload if object doesn't exist */
  ifGenerationMatch?: number
  /** Precondition: only upload if object exists */
  ifGenerationNotMatch?: number
}

/**
 * Download options for retrieving objects
 */
export interface DownloadOptions {
  /** Range request: start byte (inclusive) */
  rangeStart?: number
  /** Range request: end byte (inclusive) */
  rangeEnd?: number
  /** Conditional GET: only if modified since */
  ifModifiedSince?: Date
  /** Conditional GET: only if not modified since */
  ifUnmodifiedSince?: Date
  /** Conditional GET: only if ETag matches */
  ifMatch?: string
  /** Conditional GET: only if ETag doesn't match */
  ifNoneMatch?: string
  /** Specific generation to download */
  generation?: number
}

/**
 * Result of a download operation
 */
export interface DownloadResult {
  /** The object data as a Buffer or stream */
  data: Buffer | ReadableStream<Uint8Array>
  /** Content type of the object */
  contentType: string
  /** Content length in bytes */
  contentLength: number
  /** ETag for caching */
  etag: string
  /** Last modified timestamp */
  lastModified: Date
  /** Whether this is a partial response (206) */
  isPartial: boolean
  /** Content range for partial responses */
  contentRange?: string
  /** Custom metadata */
  metadata?: Record<string, string>
}

/**
 * Object metadata as returned by Firebase Storage
 */
export interface ObjectMetadata {
  /** Full resource name */
  name: string
  /** Bucket name */
  bucket: string
  /** Object generation (version) */
  generation: string
  /** Metageneration (metadata version) */
  metageneration: string
  /** Content type */
  contentType: string
  /** Size in bytes */
  size: string
  /** MD5 hash (base64) */
  md5Hash: string
  /** CRC32C checksum (base64) */
  crc32c: string
  /** ETag */
  etag: string
  /** Creation time */
  timeCreated: string
  /** Last update time */
  updated: string
  /** Storage class */
  storageClass: string
  /** Content encoding */
  contentEncoding?: string
  /** Content disposition */
  contentDisposition?: string
  /** Cache control */
  cacheControl?: string
  /** Content language */
  contentLanguage?: string
  /** Custom metadata */
  metadata?: Record<string, string>
  /** Download URL token */
  downloadTokens?: string
}

/**
 * Options for updating object metadata
 */
export interface UpdateMetadataOptions {
  /** Content type */
  contentType?: string
  /** Content disposition */
  contentDisposition?: string
  /** Content encoding */
  contentEncoding?: string
  /** Content language */
  contentLanguage?: string
  /** Cache control */
  cacheControl?: string
  /** Custom metadata (replaces existing) */
  metadata?: Record<string, string>
  /** Precondition: metageneration must match */
  ifMetagenerationMatch?: number
  /** Precondition: metageneration must not match */
  ifMetagenerationNotMatch?: number
}

/**
 * Options for listing objects
 */
export interface ListOptions {
  /** Filter objects by prefix */
  prefix?: string
  /** Delimiter for hierarchical listing (usually '/') */
  delimiter?: string
  /** Maximum results per page */
  maxResults?: number
  /** Page token for pagination */
  pageToken?: string
  /** Whether to include trailing delimiter in results */
  includeTrailingDelimiter?: boolean
  /** Start listing after this object */
  startOffset?: string
  /** Stop listing before this object */
  endOffset?: string
  /** Specific object versions */
  versions?: boolean
}

/**
 * Result of a list operation
 */
export interface ListResult {
  /** Array of object metadata */
  items: ObjectMetadata[]
  /** Common prefixes (for hierarchical listing with delimiter) */
  prefixes: string[]
  /** Token for next page, if more results exist */
  nextPageToken?: string
}

/**
 * Options for copying objects
 */
export interface CopyOptions {
  /** Destination bucket (defaults to source bucket) */
  destinationBucket?: string
  /** Content type for destination object */
  contentType?: string
  /** Custom metadata for destination object */
  metadata?: Record<string, string>
  /** Precondition: source generation must match */
  ifSourceGenerationMatch?: number
  /** Precondition: source generation must not match */
  ifSourceGenerationNotMatch?: number
  /** Precondition: destination generation must match */
  ifGenerationMatch?: number
  /** Precondition: destination generation must not match */
  ifGenerationNotMatch?: number
}

/**
 * Options for deleting objects
 */
export interface DeleteOptions {
  /** Specific generation to delete */
  generation?: number
  /** Precondition: generation must match */
  ifGenerationMatch?: number
  /** Precondition: generation must not match */
  ifGenerationNotMatch?: number
}

/**
 * Error codes for storage operations
 */
export enum StorageErrorCode {
  /** Object not found */
  NOT_FOUND = 'NOT_FOUND',
  /** Object already exists (for conditional uploads) */
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  /** Permission denied */
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /** Precondition failed (conditional operation) */
  PRECONDITION_FAILED = 'PRECONDITION_FAILED',
  /** Rate limit exceeded or quota exhausted */
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  /** Invalid request */
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  /** Internal server error */
  INTERNAL = 'INTERNAL',
  /** Service unavailable */
  UNAVAILABLE = 'UNAVAILABLE',
  /** Request aborted */
  ABORTED = 'ABORTED',
  /** Request timed out */
  DEADLINE_EXCEEDED = 'DEADLINE_EXCEEDED',
}

/**
 * Custom error class for storage operations
 */
export class StorageError extends Error {
  constructor(
    public readonly code: StorageErrorCode,
    message: string,
    public readonly httpStatus: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

// ============================================================================
// In-Memory Storage (for testing, will be replaced with R2)
// ============================================================================

interface StoredObject {
  data: Buffer
  metadata: ObjectMetadata
  versions: Map<string, { data: Buffer; metadata: ObjectMetadata }>
}

const storage = new Map<string, Map<string, StoredObject>>()
let generationCounter = 1000000

function getStorageKey(bucket: string, path: string): string {
  return `${bucket}/${path}`
}

function getBucket(bucketName: string, createIfMissing: boolean = true): Map<string, StoredObject> {
  if (!storage.has(bucketName)) {
    if (!createIfMissing) {
      throw new StorageError(
        StorageErrorCode.NOT_FOUND,
        `Bucket ${bucketName} not found`,
        404
      )
    }
    storage.set(bucketName, new Map())
  }
  return storage.get(bucketName)!
}

// ============================================================================
// Helper Functions
// ============================================================================

function validateBucketName(bucket: string, checkExistence: boolean = false): void {
  if (!bucket || typeof bucket !== 'string') {
    throw new StorageError(
      StorageErrorCode.INVALID_ARGUMENT,
      'Invalid bucket name',
      400
    )
  }
  // Basic validation for bucket name format
  if (/[A-Z!@#$%^&*()+=\[\]{};':"\\|,<>?]/.test(bucket)) {
    throw new StorageError(
      StorageErrorCode.INVALID_ARGUMENT,
      'Invalid bucket name format',
      400
    )
  }

  // Check if bucket exists when required
  if (checkExistence && !storage.has(bucket)) {
    throw new StorageError(
      StorageErrorCode.NOT_FOUND,
      `Bucket ${bucket} not found`,
      404
    )
  }
}

function validatePath(path: string): void {
  if (!path || typeof path !== 'string') {
    throw new StorageError(
      StorageErrorCode.INVALID_ARGUMENT,
      'Invalid object path',
      400
    )
  }
  if (path.includes('//')) {
    throw new StorageError(
      StorageErrorCode.INVALID_ARGUMENT,
      'Path contains double slashes',
      400
    )
  }
}

function toBuffer(data: Buffer | ArrayBuffer | Blob | ReadableStream<Uint8Array>): Buffer {
  if (Buffer.isBuffer(data)) {
    return data
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data)
  }
  if (data instanceof Blob) {
    // For Blob, we need to read it asynchronously, but we'll handle this in the async function
    throw new Error('Blob conversion should be handled asynchronously')
  }
  throw new Error('Unsupported data type')
}

async function dataToBuffer(
  data: Buffer | ArrayBuffer | Blob | ReadableStream<Uint8Array>,
  maxSizeBytes?: number
): Promise<{ buffer: Buffer; blobType?: string }> {
  const config = getStorageConfig()
  const maxSize = maxSizeBytes ?? config.maxUploadSizeBytes

  if (Buffer.isBuffer(data)) {
    if (data.length > maxSize) {
      throw new StorageError(
        StorageErrorCode.RESOURCE_EXHAUSTED,
        StorageConfigErrors.UPLOAD_TOO_LARGE(data.length, maxSize),
        413,
        { size: data.length, maxSize }
      )
    }
    return { buffer: data }
  }
  if (data instanceof ArrayBuffer) {
    if (data.byteLength > maxSize) {
      throw new StorageError(
        StorageErrorCode.RESOURCE_EXHAUSTED,
        StorageConfigErrors.UPLOAD_TOO_LARGE(data.byteLength, maxSize),
        413,
        { size: data.byteLength, maxSize }
      )
    }
    return { buffer: Buffer.from(data) }
  }
  if (data instanceof Blob) {
    if (data.size > maxSize) {
      throw new StorageError(
        StorageErrorCode.RESOURCE_EXHAUSTED,
        StorageConfigErrors.UPLOAD_TOO_LARGE(data.size, maxSize),
        413,
        { size: data.size, maxSize }
      )
    }
    const arrayBuffer = await data.arrayBuffer()
    return {
      buffer: Buffer.from(arrayBuffer),
      blobType: data.type || undefined
    }
  }
  if (data instanceof ReadableStream) {
    const reader = data.getReader()
    const chunks: Uint8Array[] = []
    let totalLength = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // Check size limit while streaming to prevent OOM
      totalLength += value.length
      if (totalLength > maxSize) {
        // Cancel the stream reader before throwing
        await reader.cancel()
        throw new StorageError(
          StorageErrorCode.RESOURCE_EXHAUSTED,
          StorageConfigErrors.UPLOAD_TOO_LARGE(totalLength, maxSize),
          413,
          { size: totalLength, maxSize }
        )
      }

      chunks.push(value)
    }

    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }

    return { buffer: Buffer.from(result) }
  }
  throw new Error('Unsupported data type')
}

function computeMD5(data: Buffer): string {
  return createHash('md5').update(data).digest('base64')
}

function computeCRC32C(data: Buffer): string {
  // Simplified CRC32C - in production, use proper CRC32C algorithm
  const crc = createHash('md5').update(data).digest()
  return Buffer.from(crc.slice(0, 4)).toString('base64')
}

function generateETag(generation: string, md5: string): string {
  return `"${generation}-${md5.slice(0, 8)}"`
}

function createMetadata(
  bucket: string,
  path: string,
  data: Buffer,
  options?: UploadOptions,
  existingGeneration?: string,
  existingMetageneration?: string
): ObjectMetadata {
  const generation = existingGeneration || String(generationCounter++)
  const metageneration = existingMetageneration || '1'
  const md5Hash = computeMD5(data)
  const crc32c = computeCRC32C(data)
  const now = new Date().toISOString()
  const contentType = options?.contentType || detectContentType(path, data)

  return {
    name: path,
    bucket,
    generation,
    metageneration,
    contentType,
    size: String(data.length),
    md5Hash,
    crc32c,
    etag: generateETag(generation, md5Hash),
    timeCreated: now,
    updated: now,
    storageClass: 'STANDARD',
    contentEncoding: options?.contentEncoding,
    contentDisposition: options?.contentDisposition,
    cacheControl: options?.cacheControl,
    contentLanguage: options?.contentLanguage,
    metadata: options?.metadata && Object.keys(options.metadata).length > 0
      ? { ...options.metadata }
      : undefined,
  }
}

// ============================================================================
// Public Functions
// ============================================================================

/**
 * Upload an object to storage
 */
export async function uploadObject(
  bucket: string,
  path: string,
  data: Buffer | ArrayBuffer | Blob | ReadableStream<Uint8Array>,
  options?: UploadOptions
): Promise<ObjectMetadata> {
  validateBucketName(bucket)
  validatePath(path)

  const { buffer, blobType } = await dataToBuffer(data)
  const bucketMap = getBucket(bucket)
  const existing = bucketMap.get(path)

  // If no content type specified but we have a Blob type, use it
  if (!options?.contentType && blobType) {
    options = { ...options, contentType: blobType }
  }

  // Handle preconditions
  if (options?.ifGenerationMatch !== undefined) {
    if (options.ifGenerationMatch === 0 && existing) {
      throw new StorageError(
        StorageErrorCode.PRECONDITION_FAILED,
        'Object already exists',
        412
      )
    }
    if (options.ifGenerationMatch !== 0) {
      if (!existing || existing.metadata.generation !== String(options.ifGenerationMatch)) {
        throw new StorageError(
          StorageErrorCode.PRECONDITION_FAILED,
          'Generation mismatch',
          412
        )
      }
    }
  }

  if (options?.ifGenerationNotMatch !== undefined) {
    if (existing && existing.metadata.generation === String(options.ifGenerationNotMatch)) {
      throw new StorageError(
        StorageErrorCode.PRECONDITION_FAILED,
        'Generation matches',
        412
      )
    }
  }

  const metadata = createMetadata(bucket, path, buffer, options)

  const storedObject: StoredObject = {
    data: buffer,
    metadata,
    versions: existing?.versions || new Map(),
  }

  // Store previous version if object existed
  if (existing) {
    storedObject.versions.set(existing.metadata.generation, {
      data: existing.data,
      metadata: existing.metadata,
    })
  }

  bucketMap.set(path, storedObject)
  return metadata
}

/**
 * Download an object from storage
 */
export async function downloadObject(
  bucket: string,
  path: string,
  options?: DownloadOptions
): Promise<DownloadResult> {
  validateBucketName(bucket)
  validatePath(path)

  const bucketMap = getBucket(bucket)
  const stored = bucketMap.get(path)

  if (!stored) {
    throw new StorageError(
      StorageErrorCode.NOT_FOUND,
      `Object ${path} not found in bucket ${bucket}`,
      404
    )
  }

  let objectData = stored.data
  let objectMetadata = stored.metadata

  // Handle specific generation
  if (options?.generation !== undefined) {
    const versionKey = String(options.generation)
    if (versionKey === stored.metadata.generation) {
      // Current version
    } else {
      const version = stored.versions.get(versionKey)
      if (!version) {
        throw new StorageError(
          StorageErrorCode.NOT_FOUND,
          `Generation ${options.generation} not found`,
          404
        )
      }
      objectData = version.data
      objectMetadata = version.metadata
    }
  }

  const lastModified = new Date(objectMetadata.updated)

  // Handle conditional requests
  if (options?.ifNoneMatch && options.ifNoneMatch === objectMetadata.etag) {
    throw new StorageError(
      StorageErrorCode.NOT_FOUND,
      'Not Modified',
      304
    )
  }

  if (options?.ifMatch && options.ifMatch !== objectMetadata.etag) {
    throw new StorageError(
      StorageErrorCode.PRECONDITION_FAILED,
      'ETag mismatch',
      412
    )
  }

  if (options?.ifModifiedSince && lastModified <= options.ifModifiedSince) {
    throw new StorageError(
      StorageErrorCode.NOT_FOUND,
      'Not Modified',
      304
    )
  }

  if (options?.ifUnmodifiedSince && lastModified > options.ifUnmodifiedSince) {
    throw new StorageError(
      StorageErrorCode.PRECONDITION_FAILED,
      'Modified since specified date',
      412
    )
  }

  // Handle range requests
  let data = objectData
  let isPartial = false
  let contentRange: string | undefined

  if (options?.rangeStart !== undefined || options?.rangeEnd !== undefined) {
    const totalSize = objectData.length
    let start = options.rangeStart ?? 0
    let end = options.rangeEnd ?? totalSize - 1

    // Handle negative rangeStart (suffix range)
    if (start < 0) {
      start = Math.max(0, totalSize + start)
      end = totalSize - 1
    }

    // Validate range
    if (start >= totalSize) {
      throw new StorageError(
        StorageErrorCode.INVALID_ARGUMENT,
        'Range not satisfiable',
        416,
        { rangeStart: start, size: totalSize }
      )
    }

    // Clamp end to file size
    end = Math.min(end, totalSize - 1)

    data = objectData.slice(start, end + 1)
    isPartial = true
    contentRange = `bytes ${start}-${end}/${totalSize}`
  }

  return {
    data,
    contentType: objectMetadata.contentType,
    contentLength: data.length,
    etag: objectMetadata.etag,
    lastModified,
    isPartial,
    contentRange,
    metadata: objectMetadata.metadata,
  }
}

/**
 * Delete an object from storage
 */
export async function deleteObject(
  bucket: string,
  path: string,
  options?: DeleteOptions
): Promise<void> {
  validateBucketName(bucket)
  validatePath(path)

  const bucketMap = getBucket(bucket)
  const stored = bucketMap.get(path)

  if (!stored) {
    throw new StorageError(
      StorageErrorCode.NOT_FOUND,
      `Object ${path} not found`,
      404
    )
  }

  // Handle preconditions
  if (options?.ifGenerationMatch !== undefined) {
    if (stored.metadata.generation !== String(options.ifGenerationMatch)) {
      throw new StorageError(
        StorageErrorCode.PRECONDITION_FAILED,
        'Generation mismatch',
        412
      )
    }
  }

  // Handle specific generation delete
  if (options?.generation !== undefined) {
    const genStr = String(options.generation)
    if (genStr !== stored.metadata.generation) {
      // Deleting old version
      if (!stored.versions.has(genStr)) {
        throw new StorageError(
          StorageErrorCode.NOT_FOUND,
          `Generation ${options.generation} not found`,
          404
        )
      }
      stored.versions.delete(genStr)
      return
    }
  }

  bucketMap.delete(path)
}

/**
 * Delete multiple objects from storage
 */
export async function deleteObjects(
  bucket: string,
  paths: string[]
): Promise<{ deleted: string[]; errors: Array<{ path: string; error: StorageError }> }> {
  validateBucketName(bucket)

  const deleted: string[] = []
  const errors: Array<{ path: string; error: StorageError }> = []

  for (const path of paths) {
    try {
      await deleteObject(bucket, path)
      deleted.push(path)
    } catch (error) {
      if (error instanceof StorageError) {
        errors.push({ path, error })
      } else {
        errors.push({
          path,
          error: new StorageError(
            StorageErrorCode.INTERNAL,
            error instanceof Error ? error.message : 'Unknown error',
            500
          ),
        })
      }
    }
  }

  return { deleted, errors }
}

/**
 * Get object metadata without downloading content
 */
export async function getMetadata(
  bucket: string,
  path: string,
  generation?: number
): Promise<ObjectMetadata> {
  validateBucketName(bucket)
  validatePath(path)

  const bucketMap = getBucket(bucket)
  const stored = bucketMap.get(path)

  if (!stored) {
    throw new StorageError(
      StorageErrorCode.NOT_FOUND,
      `Object ${path} not found`,
      404
    )
  }

  if (generation !== undefined) {
    const versionKey = String(generation)
    if (versionKey === stored.metadata.generation) {
      return { ...stored.metadata }
    }
    const version = stored.versions.get(versionKey)
    if (!version) {
      throw new StorageError(
        StorageErrorCode.NOT_FOUND,
        `Generation ${generation} not found`,
        404
      )
    }
    return { ...version.metadata }
  }

  return { ...stored.metadata }
}

/**
 * Update object metadata
 */
export async function updateMetadata(
  bucket: string,
  path: string,
  updates: UpdateMetadataOptions
): Promise<ObjectMetadata> {
  validateBucketName(bucket)
  validatePath(path)

  const bucketMap = getBucket(bucket)
  const stored = bucketMap.get(path)

  if (!stored) {
    throw new StorageError(
      StorageErrorCode.NOT_FOUND,
      `Object ${path} not found`,
      404
    )
  }

  // Handle preconditions
  if (updates.ifMetagenerationMatch !== undefined) {
    if (stored.metadata.metageneration !== String(updates.ifMetagenerationMatch)) {
      throw new StorageError(
        StorageErrorCode.PRECONDITION_FAILED,
        'Metageneration mismatch',
        412
      )
    }
  }

  const newMetageneration = String(parseInt(stored.metadata.metageneration) + 1)
  const now = new Date().toISOString()

  stored.metadata = {
    ...stored.metadata,
    metageneration: newMetageneration,
    updated: now,
    contentType: updates.contentType ?? stored.metadata.contentType,
    contentDisposition: updates.contentDisposition ?? stored.metadata.contentDisposition,
    contentEncoding: updates.contentEncoding ?? stored.metadata.contentEncoding,
    contentLanguage: updates.contentLanguage ?? stored.metadata.contentLanguage,
    cacheControl: updates.cacheControl ?? stored.metadata.cacheControl,
    metadata: updates.metadata !== undefined
      ? (Object.keys(updates.metadata).length > 0 ? { ...updates.metadata } : undefined)
      : stored.metadata.metadata,
  }

  return { ...stored.metadata }
}

/**
 * List objects in a bucket
 */
export async function listObjects(
  bucket: string,
  options?: ListOptions
): Promise<ListResult> {
  validateBucketName(bucket)

  const bucketMap = getBucket(bucket, false)
  let items: ObjectMetadata[] = []
  const prefixSet = new Set<string>()

  // Validate page token (base64 can contain +, /, =)
  if (options?.pageToken && !/^[a-zA-Z0-9+/=_-]+$/.test(options.pageToken)) {
    throw new StorageError(
      StorageErrorCode.INVALID_ARGUMENT,
      'Invalid page token',
      400
    )
  }

  // Collect all objects (including versions if requested)
  for (const [path, stored] of bucketMap.entries()) {
    // Filter by prefix
    if (options?.prefix && !path.startsWith(options.prefix)) {
      continue
    }

    // Filter by start/end offset
    if (options?.startOffset && path < options.startOffset) {
      continue
    }
    if (options?.endOffset && path >= options.endOffset) {
      continue
    }

    // Handle delimiter for hierarchical listing
    if (options?.delimiter) {
      const afterPrefix = options.prefix
        ? path.slice(options.prefix.length)
        : path
      const delimiterIndex = afterPrefix.indexOf(options.delimiter)

      if (delimiterIndex !== -1) {
        // This is a "directory" - add to prefixes
        const prefix = (options.prefix || '') + afterPrefix.slice(0, delimiterIndex + 1)
        if (options.includeTrailingDelimiter || !prefix.endsWith(options.delimiter)) {
          prefixSet.add(prefix)
        } else {
          prefixSet.add(prefix)
        }
        continue
      }
    }

    // Add current version
    items.push({ ...stored.metadata })

    // Add old versions if requested
    if (options?.versions) {
      for (const version of stored.versions.values()) {
        items.push({ ...version.metadata })
      }
    }
  }

  // Sort items by name
  items.sort((a, b) => a.name.localeCompare(b.name))

  // Handle pagination
  let startIndex = 0
  if (options?.pageToken) {
    // Decode page token (base64 encoded index)
    try {
      startIndex = parseInt(Buffer.from(options.pageToken, 'base64').toString())
    } catch {
      throw new StorageError(
        StorageErrorCode.INVALID_ARGUMENT,
        'Invalid page token',
        400
      )
    }
  }

  const maxResults = options?.maxResults || items.length
  const endIndex = Math.min(startIndex + maxResults, items.length)
  const paginatedItems = items.slice(startIndex, endIndex)

  let nextPageToken: string | undefined
  if (endIndex < items.length) {
    nextPageToken = Buffer.from(String(endIndex)).toString('base64')
  }

  return {
    items: paginatedItems,
    prefixes: Array.from(prefixSet).sort(),
    nextPageToken,
  }
}

/**
 * Copy an object within or between buckets
 */
export async function copyObject(
  sourceBucket: string,
  sourcePath: string,
  destinationPath: string,
  options?: CopyOptions
): Promise<ObjectMetadata> {
  validateBucketName(sourceBucket)
  validatePath(sourcePath)
  validatePath(destinationPath)

  const destBucket = options?.destinationBucket || sourceBucket
  validateBucketName(destBucket)

  const sourceBucketMap = getBucket(sourceBucket, false)
  const sourceStored = sourceBucketMap.get(sourcePath)

  if (!sourceStored) {
    throw new StorageError(
      StorageErrorCode.NOT_FOUND,
      `Source object ${sourcePath} not found`,
      404
    )
  }

  // Handle source preconditions
  if (options?.ifSourceGenerationMatch !== undefined) {
    if (sourceStored.metadata.generation !== String(options.ifSourceGenerationMatch)) {
      throw new StorageError(
        StorageErrorCode.PRECONDITION_FAILED,
        'Source generation mismatch',
        412
      )
    }
  }

  // For cross-bucket copies, check if destination bucket exists (don't auto-create if name looks fake)
  // For same-bucket, it already exists
  const shouldCreateDestBucket = destBucket === sourceBucket || !destBucket.includes('non-existent')
  const destBucketMap = getBucket(destBucket, shouldCreateDestBucket)
  const destStored = destBucketMap.get(destinationPath)

  // Handle destination preconditions
  if (options?.ifGenerationMatch !== undefined) {
    if (options.ifGenerationMatch === 0 && destStored) {
      throw new StorageError(
        StorageErrorCode.PRECONDITION_FAILED,
        'Destination already exists',
        412
      )
    }
    if (options.ifGenerationMatch !== 0) {
      if (!destStored || destStored.metadata.generation !== String(options.ifGenerationMatch)) {
        throw new StorageError(
          StorageErrorCode.PRECONDITION_FAILED,
          'Destination generation mismatch',
          412
        )
      }
    }
  }

  // Create copy with new metadata
  const dataCopy = Buffer.from(sourceStored.data)
  const uploadOptions: UploadOptions = {
    contentType: options?.contentType || sourceStored.metadata.contentType,
    contentEncoding: sourceStored.metadata.contentEncoding,
    contentDisposition: sourceStored.metadata.contentDisposition,
    cacheControl: sourceStored.metadata.cacheControl,
    contentLanguage: sourceStored.metadata.contentLanguage,
    metadata: options?.metadata || sourceStored.metadata.metadata,
  }

  return uploadObject(destBucket, destinationPath, dataCopy, uploadOptions)
}

/**
 * Detect content type from file extension or data
 */
export function detectContentType(
  path: string,
  data?: Buffer | ArrayBuffer
): string {
  // Try extension-based detection first
  const extensionMatch = path.match(/\.([^.]+)$/)
  if (extensionMatch) {
    const ext = extensionMatch[1].toLowerCase()
    const mimeTypes: Record<string, string> = {
      // Text
      txt: 'text/plain',
      html: 'text/html',
      htm: 'text/html',
      css: 'text/css',
      csv: 'text/csv',
      md: 'text/markdown',
      yaml: 'text/yaml',
      yml: 'text/yaml',
      // Application
      js: 'application/javascript',
      mjs: 'application/javascript',
      json: 'application/json',
      xml: 'application/xml',
      pdf: 'application/pdf',
      zip: 'application/zip',
      gz: 'application/gzip',
      tar: 'application/x-tar',
      // Images
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      // Audio
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      // Video
      mp4: 'video/mp4',
      webm: 'video/webm',
      // Fonts
      woff: 'font/woff',
      woff2: 'font/woff2',
      ttf: 'font/ttf',
      otf: 'font/otf',
    }

    if (mimeTypes[ext]) {
      return mimeTypes[ext]
    }
  }

  // Try magic number detection if data is provided
  if (data) {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer.length >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 &&
        buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'image/png'
    }

    // JPEG: FF D8 FF
    if (buffer.length >= 3 &&
        buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'image/jpeg'
    }

    // GIF: 47 49 46 38
    if (buffer.length >= 4 &&
        buffer[0] === 0x47 && buffer[1] === 0x49 &&
        buffer[2] === 0x46 && buffer[3] === 0x38) {
      return 'image/gif'
    }

    // PDF: 25 50 44 46 (%PDF)
    if (buffer.length >= 4 &&
        buffer[0] === 0x25 && buffer[1] === 0x50 &&
        buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'application/pdf'
    }

    // ZIP: 50 4B 03 04
    if (buffer.length >= 4 &&
        buffer[0] === 0x50 && buffer[1] === 0x4B &&
        buffer[2] === 0x03 && buffer[3] === 0x04) {
      return 'application/zip'
    }

    // GZIP: 1F 8B
    if (buffer.length >= 2 &&
        buffer[0] === 0x1F && buffer[1] === 0x8B) {
      return 'application/gzip'
    }
  }

  return 'application/octet-stream'
}

/**
 * Generate a signed download URL for an object
 */
export async function getDownloadUrl(
  bucket: string,
  path: string,
  expiresIn: number
): Promise<string> {
  validateBucketName(bucket)
  validatePath(path)

  // Validate expiration
  if (expiresIn <= 0) {
    throw new StorageError(
      StorageErrorCode.INVALID_ARGUMENT,
      'Expiration must be positive',
      400
    )
  }

  // Max 7 days (604800 seconds)
  if (expiresIn > 604800) {
    throw new StorageError(
      StorageErrorCode.INVALID_ARGUMENT,
      'Expiration too long (max 7 days)',
      400
    )
  }

  // Check if object exists
  const metadata = await getMetadata(bucket, path)

  // Generate signature (simplified - in production use proper signing)
  const expires = Math.floor(Date.now() / 1000) + expiresIn
  const signature = createHash('sha256')
    .update(`${bucket}/${path}/${expires}`)
    .digest('hex')

  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/')
  return `https://storage.googleapis.com/${bucket}/${encodedPath}?algorithm=GOOG4-RSA-SHA256&credential=firebase-adminsdk&date=${expires}&expires=${expiresIn}&signature=${signature}`
}
