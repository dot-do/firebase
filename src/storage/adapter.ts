/**
 * Storage Adapter Interface
 *
 * Defines the contract for storage backend implementations.
 * This abstraction allows swapping between different storage backends
 * such as in-memory, Cloudflare R2, local filesystem, etc.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Stored object representation
 */
export interface StoredObject {
  /** Object data as a Buffer */
  data: Buffer
  /** Object metadata */
  metadata: StoredObjectMetadata
  /** Previous versions of the object (generation -> version data) */
  versions: Map<string, { data: Buffer; metadata: StoredObjectMetadata }>
}

/**
 * Metadata for a stored object
 */
export interface StoredObjectMetadata {
  /** Full resource name (path) */
  name: string
  /** Bucket name */
  bucket: string
  /** Object generation (version) */
  generation: string
  /** Metageneration (metadata version) */
  metageneration: string
  /** Content type */
  contentType: string
  /** Size in bytes as string */
  size: string
  /** MD5 hash (base64) */
  md5Hash: string
  /** CRC32C checksum (base64) */
  crc32c: string
  /** ETag */
  etag: string
  /** Creation time (ISO string) */
  timeCreated: string
  /** Last update time (ISO string) */
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
 * Options for uploading an object
 */
export interface AdapterUploadOptions {
  /** Content type (MIME type) */
  contentType?: string
  /** Custom metadata */
  metadata?: Record<string, string>
  /** Content encoding */
  contentEncoding?: string
  /** Content disposition */
  contentDisposition?: string
  /** Cache control */
  cacheControl?: string
  /** Content language */
  contentLanguage?: string
}

/**
 * Options for listing objects
 */
export interface AdapterListOptions {
  /** Filter objects by prefix */
  prefix?: string
  /** Delimiter for hierarchical listing */
  delimiter?: string
  /** Maximum results per page */
  maxResults?: number
  /** Page token for pagination */
  pageToken?: string
  /** Start listing after this object */
  startOffset?: string
  /** Stop listing before this object */
  endOffset?: string
  /** Include all versions */
  versions?: boolean
  /** Include trailing delimiter in prefixes */
  includeTrailingDelimiter?: boolean
}

/**
 * Result of a list operation
 */
export interface AdapterListResult {
  /** Array of stored objects */
  items: StoredObject[]
  /** Common prefixes (for hierarchical listing) */
  prefixes: string[]
  /** Token for next page */
  nextPageToken?: string
}

/**
 * Options for updating object metadata
 */
export interface AdapterUpdateMetadataOptions {
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
}

// ============================================================================
// Storage Adapter Interface
// ============================================================================

/**
 * Storage adapter interface for abstracting storage backends.
 *
 * Implementations of this interface can provide different storage mechanisms
 * such as in-memory storage, Cloudflare R2, local filesystem, etc.
 *
 * @example
 * ```typescript
 * // Using the in-memory adapter
 * const adapter = new InMemoryAdapter()
 *
 * // Store an object
 * await adapter.put('my-bucket', 'path/to/file.txt', Buffer.from('Hello'), {
 *   contentType: 'text/plain'
 * })
 *
 * // Retrieve an object
 * const obj = await adapter.get('my-bucket', 'path/to/file.txt')
 * console.log(obj?.data.toString()) // 'Hello'
 * ```
 */
export interface StorageAdapter {
  /**
   * Get an object from storage
   *
   * @param bucket - Bucket name
   * @param path - Object path
   * @param generation - Optional specific generation to retrieve
   * @returns The stored object or null if not found
   */
  get(bucket: string, path: string, generation?: string): Promise<StoredObject | null>

  /**
   * Store an object in storage
   *
   * @param bucket - Bucket name
   * @param path - Object path
   * @param data - Object data
   * @param metadata - Object metadata
   * @returns The stored object with complete metadata
   */
  put(
    bucket: string,
    path: string,
    data: Buffer,
    metadata: StoredObjectMetadata
  ): Promise<StoredObject>

  /**
   * Delete an object from storage
   *
   * @param bucket - Bucket name
   * @param path - Object path
   * @param generation - Optional specific generation to delete
   * @returns True if object was deleted, false if not found
   */
  delete(bucket: string, path: string, generation?: string): Promise<boolean>

  /**
   * Check if an object exists in storage
   *
   * @param bucket - Bucket name
   * @param path - Object path
   * @returns True if object exists
   */
  exists(bucket: string, path: string): Promise<boolean>

  /**
   * List objects in a bucket
   *
   * @param bucket - Bucket name
   * @param options - List options (prefix, delimiter, pagination, etc.)
   * @returns List result with items and pagination info
   */
  list(bucket: string, options?: AdapterListOptions): Promise<AdapterListResult>

  /**
   * Update object metadata without changing the data
   *
   * @param bucket - Bucket name
   * @param path - Object path
   * @param updates - Metadata updates
   * @returns The updated stored object or null if not found
   */
  updateMetadata(
    bucket: string,
    path: string,
    updates: AdapterUpdateMetadataOptions
  ): Promise<StoredObject | null>

  /**
   * Check if a bucket exists
   *
   * @param bucket - Bucket name
   * @returns True if bucket exists
   */
  bucketExists(bucket: string): Promise<boolean>

  /**
   * Create a bucket (if the adapter supports it)
   *
   * @param bucket - Bucket name
   */
  createBucket(bucket: string): Promise<void>

  /**
   * Delete a bucket (if empty)
   *
   * @param bucket - Bucket name
   * @returns True if bucket was deleted, false if not found or not empty
   */
  deleteBucket(bucket: string): Promise<boolean>

  /**
   * Clear all data (useful for testing)
   */
  clear(): Promise<void>

  /**
   * Get adapter statistics (for monitoring/debugging)
   */
  getStats(): Promise<AdapterStats>
}

/**
 * Adapter statistics
 */
export interface AdapterStats {
  /** Total number of buckets */
  bucketCount: number
  /** Total number of objects across all buckets */
  objectCount: number
  /** Total size in bytes across all objects */
  totalSizeBytes: number
  /** Per-bucket statistics */
  buckets: Record<string, { objectCount: number; sizeBytes: number }>
}
