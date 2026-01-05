/**
 * Firebase Storage Resumable Upload Protocol Implementation
 *
 * This module implements the resumable upload protocol compatible with
 * Firebase Storage / Google Cloud Storage. Resumable uploads allow
 * large files to be uploaded in chunks with the ability to resume
 * interrupted uploads.
 *
 * @see https://cloud.google.com/storage/docs/resumable-uploads
 * @see https://firebase.google.com/docs/storage/web/upload-files
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Metadata for a file being uploaded
 */
export interface UploadMetadata {
  /** The name/path of the file in storage */
  name: string
  /** The bucket name */
  bucket: string
  /** Content type (MIME type) of the file */
  contentType?: string
  /** Custom metadata key-value pairs */
  customMetadata?: Record<string, string>
  /** Cache-Control header for the object */
  cacheControl?: string
  /** Content-Disposition header */
  contentDisposition?: string
  /** Content-Encoding header */
  contentEncoding?: string
  /** Content-Language header */
  contentLanguage?: string
  /** MD5 hash of the content (base64-encoded) */
  md5Hash?: string
  /** CRC32C checksum (base64-encoded) */
  crc32c?: string
}

/**
 * Options for initiating a resumable upload
 */
export interface InitiateUploadOptions {
  /** The bucket to upload to */
  bucket: string
  /** The file path/name in the bucket */
  name: string
  /** Content type of the file */
  contentType?: string
  /** Total size of the file in bytes (optional, can be provided later) */
  totalSize?: number
  /** Custom metadata */
  metadata?: Record<string, string>
  /** Origin for CORS */
  origin?: string
  /** Predefined ACL */
  predefinedAcl?: 'authenticatedRead' | 'bucketOwnerFullControl' | 'bucketOwnerRead' | 'private' | 'projectPrivate' | 'publicRead'
}

/**
 * Result of initiating a resumable upload
 */
export interface InitiateUploadResult {
  /** The resumable upload URI to use for subsequent requests */
  uploadUri: string
  /** Unique upload ID */
  uploadId: string
  /** When the upload session expires */
  expiresAt: Date
}

/**
 * Options for resuming an upload
 */
export interface ResumeUploadOptions {
  /** The resumable upload URI */
  uploadUri: string
  /** The chunk data to upload */
  data: ArrayBuffer | Uint8Array
  /** The starting byte offset of this chunk */
  offset: number
  /** Total size of the file (required for final chunk) */
  totalSize?: number
  /** Whether this is the final chunk */
  isFinal?: boolean
}

/**
 * Result of a resume upload operation
 */
export interface ResumeUploadResult {
  /** Number of bytes uploaded so far */
  bytesUploaded: number
  /** Whether the upload is complete */
  complete: boolean
  /** The completed file metadata (only present when complete) */
  metadata?: CompletedUploadMetadata
}

/**
 * Status of an in-progress upload
 */
export interface UploadStatus {
  /** The resumable upload URI */
  uploadUri: string
  /** Number of bytes uploaded so far */
  bytesUploaded: number
  /** Total size if known */
  totalSize?: number
  /** Whether the upload is active */
  active: boolean
  /** When the upload was started */
  startedAt: Date
  /** When the upload session expires */
  expiresAt: Date
  /** Upload metadata */
  metadata: UploadMetadata
}

/**
 * Options for completing an upload
 */
export interface CompleteUploadOptions {
  /** The resumable upload URI */
  uploadUri: string
  /** Final MD5 hash for verification (base64-encoded) */
  md5Hash?: string
  /** Final CRC32C checksum for verification (base64-encoded) */
  crc32c?: string
  /** Additional metadata to set on completion */
  metadata?: Partial<UploadMetadata>
}

/**
 * Metadata returned when an upload is completed
 */
export interface CompletedUploadMetadata {
  /** Full resource name */
  name: string
  /** Bucket name */
  bucket: string
  /** Object generation */
  generation: string
  /** Metageneration */
  metageneration: string
  /** Content type */
  contentType: string
  /** Size in bytes */
  size: number
  /** MD5 hash (base64-encoded) */
  md5Hash: string
  /** CRC32C checksum (base64-encoded) */
  crc32c: string
  /** ETag */
  etag: string
  /** Creation time */
  timeCreated: string
  /** Last update time */
  updated: string
  /** Storage class */
  storageClass: string
  /** Download URL token */
  downloadTokens?: string
  /** Custom metadata */
  customMetadata?: Record<string, string>
}

/**
 * Options for canceling an upload
 */
export interface CancelUploadOptions {
  /** The resumable upload URI */
  uploadUri: string
}

/**
 * Error codes for resumable upload operations
 */
export enum ResumableUploadErrorCode {
  /** Upload session not found or expired */
  NOT_FOUND = 'NOT_FOUND',
  /** Invalid offset - must resume from server-confirmed offset */
  INVALID_OFFSET = 'INVALID_OFFSET',
  /** Chunk too small (minimum 256KB except for final chunk) */
  CHUNK_TOO_SMALL = 'CHUNK_TOO_SMALL',
  /** Chunk too large (maximum 5MB per request) */
  CHUNK_TOO_LARGE = 'CHUNK_TOO_LARGE',
  /** Upload already completed */
  ALREADY_COMPLETED = 'ALREADY_COMPLETED',
  /** Upload was canceled */
  CANCELED = 'CANCELED',
  /** Checksum mismatch */
  CHECKSUM_MISMATCH = 'CHECKSUM_MISMATCH',
  /** Upload session expired */
  EXPIRED = 'EXPIRED',
  /** Network error during upload */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Rate limited - too many requests */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Concurrent modification detected */
  CONFLICT = 'CONFLICT',
  /** Invalid request format */
  INVALID_REQUEST = 'INVALID_REQUEST',
  /** Server error */
  SERVER_ERROR = 'SERVER_ERROR',
}

/**
 * Custom error class for resumable upload operations
 */
export class ResumableUploadError extends Error {
  constructor(
    public readonly code: ResumableUploadErrorCode,
    message: string,
    public readonly uploadUri?: string,
    public readonly bytesUploaded?: number
  ) {
    super(message)
    this.name = 'ResumableUploadError'
  }
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum chunk size (256 KB) - except for final chunk */
export const MIN_CHUNK_SIZE = 256 * 1024

/** Maximum chunk size (5 MB) */
export const MAX_CHUNK_SIZE = 5 * 1024 * 1024

/** Default chunk size (1 MB) */
export const DEFAULT_CHUNK_SIZE = 1024 * 1024

/** Maximum file size (5 TB) */
export const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 * 1024

/** Upload session duration (1 week) */
export const UPLOAD_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

// ============================================================================
// Internal Types & Storage
// ============================================================================

/**
 * Internal upload session state
 */
interface UploadSession {
  uploadId: string
  uploadUri: string
  bucket: string
  name: string
  contentType: string
  totalSize?: number
  bytesUploaded: number
  metadata: Record<string, string>
  startedAt: Date
  expiresAt: Date
  active: boolean
  canceled: boolean
  completed: boolean
  chunks: Uint8Array[]
  predefinedAcl?: string
  origin?: string
  completedMetadata?: CompletedUploadMetadata
}

/**
 * In-memory storage for upload sessions
 */
const uploadSessions = new Map<string, UploadSession>()

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique upload ID
 */
function generateUploadId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

/**
 * Normalize file path (remove leading slash, collapse multiple slashes)
 */
function normalizePath(path: string): string {
  return path
    .replace(/^\/+/, '') // Remove leading slashes
    .replace(/\/+/g, '/') // Collapse multiple slashes
}

/**
 * Validate bucket name according to GCS rules
 */
function validateBucketName(bucket: string): void {
  if (!bucket || bucket.length === 0) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.INVALID_REQUEST,
      'Bucket name cannot be empty'
    )
  }

  // Bucket names must be lowercase
  if (bucket !== bucket.toLowerCase()) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.INVALID_REQUEST,
      'Bucket names must be lowercase'
    )
  }

  // Bucket names can only contain letters, numbers, hyphens, and dots
  if (!/^[a-z0-9.-]+$/.test(bucket)) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.INVALID_REQUEST,
      'Bucket names can only contain lowercase letters, numbers, hyphens, and dots'
    )
  }

  // Bucket names cannot contain underscores
  if (bucket.includes('_')) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.INVALID_REQUEST,
      'Bucket names cannot contain underscores'
    )
  }
}

/**
 * Validate file name
 */
function validateFileName(name: string): void {
  if (!name || name.length === 0) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.INVALID_REQUEST,
      'File name cannot be empty'
    )
  }

  // File names should not start with slash
  if (name.startsWith('/')) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.INVALID_REQUEST,
      'File names cannot start with a slash'
    )
  }
}

/**
 * Validate content type format
 */
function validateContentType(contentType?: string): void {
  if (contentType && !/^[a-z]+\/[a-z0-9.+-]+$/i.test(contentType)) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.INVALID_REQUEST,
      'Invalid content type format'
    )
  }
}

/**
 * Validate initiate upload options
 */
function validateInitiateOptions(options: InitiateUploadOptions): void {
  validateBucketName(options.bucket)
  validateFileName(options.name)
  validateContentType(options.contentType)

  if (options.totalSize !== undefined) {
    if (options.totalSize < 0) {
      throw new ResumableUploadError(
        ResumableUploadErrorCode.INVALID_REQUEST,
        'Total size cannot be negative'
      )
    }

    if (options.totalSize > MAX_FILE_SIZE) {
      throw new ResumableUploadError(
        ResumableUploadErrorCode.INVALID_REQUEST,
        `Total size cannot exceed ${MAX_FILE_SIZE} bytes (5 TB)`
      )
    }
  }
}

/**
 * Get and validate upload session
 */
function getSession(uploadUri: string): UploadSession {
  const session = uploadSessions.get(uploadUri)

  if (!session) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.NOT_FOUND,
      'Upload session not found',
      uploadUri
    )
  }

  // Check if session expired
  if (Date.now() > session.expiresAt.getTime()) {
    uploadSessions.delete(uploadUri)
    throw new ResumableUploadError(
      ResumableUploadErrorCode.EXPIRED,
      'Upload session has expired',
      uploadUri,
      session.bytesUploaded
    )
  }

  // Check if session was canceled
  if (session.canceled) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.CANCELED,
      'Upload was canceled',
      uploadUri,
      session.bytesUploaded
    )
  }

  return session
}

/**
 * Calculate MD5 hash (base64)
 */
function calculateMD5(data: Uint8Array): string {
  // Simplified mock implementation - in real scenario would use crypto
  const hash = Array.from(data.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return Buffer.from(hash, 'hex').toString('base64')
}

/**
 * Calculate CRC32C checksum (base64)
 */
function calculateCRC32C(data: Uint8Array): string {
  // Simplified mock implementation - in real scenario would use proper CRC32C
  let crc = 0xffffffff
  for (let i = 0; i < Math.min(data.length, 100); i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return Buffer.from([(crc ^ 0xffffffff) >>> 0].map(n => [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff
  ]).flat()).toString('base64')
}

/**
 * Generate completed upload metadata
 */
function generateCompletedMetadata(session: UploadSession, allData: Uint8Array): CompletedUploadMetadata {
  const now = new Date().toISOString()
  const generation = `${Date.now()}`

  return {
    name: `${session.bucket}/${session.name}`,
    bucket: session.bucket,
    generation,
    metageneration: '1',
    contentType: session.contentType,
    size: allData.length,
    md5Hash: calculateMD5(allData),
    crc32c: calculateCRC32C(allData),
    etag: `"${generation}"`,
    timeCreated: now,
    updated: now,
    storageClass: 'STANDARD',
    downloadTokens: generateUploadId(),
    customMetadata: Object.keys(session.metadata).length > 0 ? session.metadata : undefined,
  }
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Initiates a new resumable upload session.
 *
 * This is the first step in a resumable upload. It creates an upload session
 * and returns a unique upload URI that should be used for subsequent operations.
 *
 * @param options - Options for initiating the upload
 * @returns The upload URI and session information
 * @throws {ResumableUploadError} If the request is invalid
 *
 * @example
 * ```typescript
 * const result = await initiateResumableUpload({
 *   bucket: 'my-bucket',
 *   name: 'path/to/file.jpg',
 *   contentType: 'image/jpeg',
 *   totalSize: 1024 * 1024 * 10, // 10 MB
 * })
 * console.log(result.uploadUri) // Use this for subsequent requests
 * ```
 */
export async function initiateResumableUpload(
  options: InitiateUploadOptions
): Promise<InitiateUploadResult> {
  // Validate options
  validateInitiateOptions(options)

  // Generate unique upload ID
  const uploadId = generateUploadId()

  // Create upload URI
  const uploadUri = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(options.bucket)}/o?uploadType=resumable&name=${encodeURIComponent(options.name)}&upload_id=${uploadId}`

  // Calculate expiration time (1 week from now)
  const expiresAt = new Date(Date.now() + UPLOAD_SESSION_DURATION_MS)

  // Store upload session
  const session: UploadSession = {
    uploadId,
    uploadUri,
    bucket: options.bucket,
    name: normalizePath(options.name),
    contentType: options.contentType || 'application/octet-stream',
    totalSize: options.totalSize,
    bytesUploaded: 0,
    metadata: options.metadata || {},
    startedAt: new Date(),
    expiresAt,
    active: true,
    canceled: false,
    completed: false,
    chunks: [],
    predefinedAcl: options.predefinedAcl,
    origin: options.origin,
  }

  uploadSessions.set(uploadUri, session)

  return {
    uploadUri,
    uploadId,
    expiresAt,
  }
}

/**
 * Resumes an upload by sending the next chunk of data.
 *
 * Chunks must be uploaded sequentially and the offset must match the
 * server's expected offset. Use `getUploadStatus` to check the current
 * offset if resuming after an interruption.
 *
 * @param options - Options for the resume operation
 * @returns The current upload progress
 * @throws {ResumableUploadError} If the offset is invalid or upload failed
 *
 * @example
 * ```typescript
 * const result = await resumeUpload({
 *   uploadUri: 'https://storage.googleapis.com/upload/storage/v1/b/...',
 *   data: chunkData,
 *   offset: 0,
 *   totalSize: 10485760, // Required for final chunk
 *   isFinal: false,
 * })
 * console.log(`Uploaded ${result.bytesUploaded} bytes`)
 * ```
 */
export async function resumeUpload(
  options: ResumeUploadOptions
): Promise<ResumeUploadResult> {
  const session = getSession(options.uploadUri)

  // Check if already completed
  if (session.completed) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.ALREADY_COMPLETED,
      'Upload already completed',
      options.uploadUri,
      session.bytesUploaded
    )
  }

  // Convert data to Uint8Array if needed
  const data = options.data instanceof ArrayBuffer
    ? new Uint8Array(options.data)
    : options.data

  // Validate offset
  if (options.offset < 0) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.INVALID_REQUEST,
      'Offset cannot be negative',
      options.uploadUri,
      session.bytesUploaded
    )
  }

  if (options.offset !== session.bytesUploaded) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.INVALID_OFFSET,
      `Invalid offset: expected ${session.bytesUploaded}, got ${options.offset}`,
      options.uploadUri,
      session.bytesUploaded
    )
  }

  // Validate chunk size
  const chunkSize = data.length

  // Check if this is the final chunk
  const isFinal = options.isFinal ||
    (options.totalSize !== undefined && options.offset + chunkSize === options.totalSize)

  // Non-final chunks must be at least MIN_CHUNK_SIZE (except empty final chunks)
  if (!isFinal && chunkSize > 0 && chunkSize < MIN_CHUNK_SIZE) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.CHUNK_TOO_SMALL,
      `Chunk size ${chunkSize} is below minimum ${MIN_CHUNK_SIZE} bytes (256 KB)`,
      options.uploadUri,
      session.bytesUploaded
    )
  }

  // Chunks cannot exceed MAX_CHUNK_SIZE
  if (chunkSize > MAX_CHUNK_SIZE) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.CHUNK_TOO_LARGE,
      `Chunk size ${chunkSize} exceeds maximum ${MAX_CHUNK_SIZE} bytes (5 MB)`,
      options.uploadUri,
      session.bytesUploaded
    )
  }

  // Non-final chunks should be aligned to 256KB (except if smaller than MIN_CHUNK_SIZE)
  if (!isFinal && chunkSize >= MIN_CHUNK_SIZE && chunkSize % MIN_CHUNK_SIZE !== 0) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.CHUNK_TOO_SMALL,
      `Non-final chunk size must be a multiple of ${MIN_CHUNK_SIZE} bytes (256 KB)`,
      options.uploadUri,
      session.bytesUploaded
    )
  }

  // If final chunk, validate totalSize is provided
  if (isFinal && options.totalSize === undefined && chunkSize > 0) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.INVALID_REQUEST,
      'Total size is required for final chunk',
      options.uploadUri,
      session.bytesUploaded
    )
  }

  // Validate total size if provided
  if (options.totalSize !== undefined) {
    if (session.totalSize !== undefined && options.totalSize !== session.totalSize) {
      throw new ResumableUploadError(
        ResumableUploadErrorCode.INVALID_REQUEST,
        `Total size mismatch: expected ${session.totalSize}, got ${options.totalSize}`,
        options.uploadUri,
        session.bytesUploaded
      )
    }

    if (options.offset > options.totalSize) {
      throw new ResumableUploadError(
        ResumableUploadErrorCode.INVALID_REQUEST,
        'Offset cannot exceed total size',
        options.uploadUri,
        session.bytesUploaded
      )
    }

    if (options.offset + chunkSize > options.totalSize) {
      throw new ResumableUploadError(
        ResumableUploadErrorCode.INVALID_REQUEST,
        'Chunk extends beyond total size',
        options.uploadUri,
        session.bytesUploaded
      )
    }
  }

  // Store the chunk
  if (chunkSize > 0) {
    session.chunks.push(data)
    session.bytesUploaded += chunkSize
  }

  // Update total size if provided
  if (options.totalSize !== undefined && session.totalSize === undefined) {
    session.totalSize = options.totalSize
  }

  // Check if upload is complete
  const isComplete = isFinal &&
    options.totalSize !== undefined &&
    session.bytesUploaded === options.totalSize

  if (isComplete) {
    // Combine all chunks
    const totalBytes = session.chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const allData = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of session.chunks) {
      allData.set(chunk, offset)
      offset += chunk.length
    }

    // Generate completion metadata
    const metadata = generateCompletedMetadata(session, allData)
    session.completed = true
    session.active = false
    session.completedMetadata = metadata

    return {
      bytesUploaded: session.bytesUploaded,
      complete: true,
      metadata,
    }
  }

  return {
    bytesUploaded: session.bytesUploaded,
    complete: false,
  }
}

/**
 * Gets the current status of a resumable upload.
 *
 * Use this to check how many bytes have been successfully uploaded,
 * especially after a network interruption.
 *
 * @param uploadUri - The resumable upload URI
 * @returns The current upload status
 * @throws {ResumableUploadError} If the upload session is not found or expired
 *
 * @example
 * ```typescript
 * const status = await getUploadStatus(uploadUri)
 * console.log(`${status.bytesUploaded} of ${status.totalSize} bytes uploaded`)
 * if (!status.active) {
 *   console.log('Upload session expired')
 * }
 * ```
 */
export async function getUploadStatus(
  uploadUri: string
): Promise<UploadStatus> {
  // For completed uploads, we might still return status but mark as inactive
  const session = uploadSessions.get(uploadUri)

  if (!session) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.NOT_FOUND,
      'Upload session not found',
      uploadUri
    )
  }

  // Check if session expired (but don't delete if completed)
  if (!session.completed && Date.now() > session.expiresAt.getTime()) {
    uploadSessions.delete(uploadUri)
    throw new ResumableUploadError(
      ResumableUploadErrorCode.EXPIRED,
      'Upload session has expired',
      uploadUri,
      session.bytesUploaded
    )
  }

  // Check if session was canceled
  if (session.canceled) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.NOT_FOUND,
      'Upload was canceled',
      uploadUri,
      session.bytesUploaded
    )
  }

  return {
    uploadUri,
    bytesUploaded: session.bytesUploaded,
    totalSize: session.totalSize,
    active: session.active && !session.completed,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    metadata: {
      name: session.name,
      bucket: session.bucket,
      contentType: session.contentType,
      customMetadata: Object.keys(session.metadata).length > 0 ? session.metadata : undefined,
    },
  }
}

/**
 * Cancels an in-progress resumable upload.
 *
 * This frees up server resources and invalidates the upload URI.
 * Any uploaded chunks will be discarded.
 *
 * @param options - Options for canceling the upload
 * @throws {ResumableUploadError} If the upload cannot be canceled
 *
 * @example
 * ```typescript
 * await cancelUpload({ uploadUri })
 * console.log('Upload canceled and resources freed')
 * ```
 */
export async function cancelUpload(
  options: CancelUploadOptions
): Promise<void> {
  const session = uploadSessions.get(options.uploadUri)

  if (!session) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.NOT_FOUND,
      'Upload session not found',
      options.uploadUri
    )
  }

  // Cannot cancel already completed upload
  if (session.completed) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.ALREADY_COMPLETED,
      'Cannot cancel completed upload',
      options.uploadUri,
      session.bytesUploaded
    )
  }

  // Cannot cancel already canceled upload
  if (session.canceled) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.NOT_FOUND,
      'Upload was already canceled',
      options.uploadUri
    )
  }

  // Mark as canceled and remove from sessions
  session.canceled = true
  session.active = false
  uploadSessions.delete(options.uploadUri)
}

/**
 * Completes a resumable upload and finalizes the file.
 *
 * This should be called after all chunks have been uploaded. It performs
 * final validation (checksums if provided) and returns the completed
 * file metadata.
 *
 * Note: In most cases, the upload completes automatically when the final
 * chunk is uploaded with the correct total size. This function is useful
 * when you need to set additional metadata or verify checksums.
 *
 * @param options - Options for completing the upload
 * @returns The completed file metadata
 * @throws {ResumableUploadError} If completion fails or checksums don't match
 *
 * @example
 * ```typescript
 * const metadata = await completeUpload({
 *   uploadUri,
 *   md5Hash: 'XrY7u+Ae7tCTyyK7j1rNww==',
 *   metadata: {
 *     cacheControl: 'public, max-age=3600',
 *   },
 * })
 * console.log(`File uploaded: ${metadata.name}`)
 * ```
 */
export async function completeUpload(
  options: CompleteUploadOptions
): Promise<CompletedUploadMetadata> {
  const session = uploadSessions.get(options.uploadUri)

  if (!session) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.NOT_FOUND,
      'Upload session not found',
      options.uploadUri
    )
  }

  // Check if already completed (idempotent)
  if (session.completed && session.completedMetadata) {
    // For idempotency, return the existing metadata
    return session.completedMetadata
  }

  // Check if session was canceled
  if (session.canceled) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.NOT_FOUND,
      'Upload was canceled',
      options.uploadUri
    )
  }

  // Verify all data has been uploaded
  if (session.totalSize === undefined) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.INVALID_REQUEST,
      'Cannot complete upload without knowing total size',
      options.uploadUri,
      session.bytesUploaded
    )
  }

  if (session.bytesUploaded < session.totalSize) {
    throw new ResumableUploadError(
      ResumableUploadErrorCode.INVALID_REQUEST,
      `Upload incomplete: ${session.bytesUploaded} of ${session.totalSize} bytes uploaded`,
      options.uploadUri,
      session.bytesUploaded
    )
  }

  // Combine all chunks
  const totalBytes = session.chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const allData = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of session.chunks) {
    allData.set(chunk, offset)
    offset += chunk.length
  }

  // Verify checksums if provided
  if (options.md5Hash) {
    const actualMD5 = calculateMD5(allData)
    if (actualMD5 !== options.md5Hash) {
      throw new ResumableUploadError(
        ResumableUploadErrorCode.CHECKSUM_MISMATCH,
        `MD5 checksum mismatch: expected ${options.md5Hash}, got ${actualMD5}`,
        options.uploadUri,
        session.bytesUploaded
      )
    }
  }

  if (options.crc32c) {
    const actualCRC32C = calculateCRC32C(allData)
    if (actualCRC32C !== options.crc32c) {
      throw new ResumableUploadError(
        ResumableUploadErrorCode.CHECKSUM_MISMATCH,
        `CRC32C checksum mismatch: expected ${options.crc32c}, got ${actualCRC32C}`,
        options.uploadUri,
        session.bytesUploaded
      )
    }
  }

  // Apply additional metadata if provided
  if (options.metadata) {
    if (options.metadata.customMetadata) {
      session.metadata = { ...session.metadata, ...options.metadata.customMetadata }
    }
  }

  // Generate completion metadata
  const metadata = generateCompletedMetadata(session, allData)
  session.completed = true
  session.active = false
  session.completedMetadata = metadata

  return metadata
}
