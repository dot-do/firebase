/**
 * In-Memory Storage Adapter
 *
 * A StorageAdapter implementation that stores all data in memory.
 * Useful for testing, development, and emulator scenarios.
 *
 * Features:
 * - Full CRUD operations
 * - Version tracking (generations)
 * - Prefix-based listing with delimiter support
 * - Pagination support
 * - Collection indexing for efficient prefix queries
 */

import {
  StorageAdapter,
  StoredObject,
  StoredObjectMetadata,
  AdapterListOptions,
  AdapterListResult,
  AdapterUpdateMetadataOptions,
  AdapterStats,
} from './adapter.js'

// ============================================================================
// Collection Index
// ============================================================================

/**
 * Collection index for efficient prefix-based queries.
 * Maps prefix -> Set of object paths that start with that prefix.
 */
interface CollectionIndex {
  /** Maps prefix -> Set of full object paths */
  prefixToObjects: Map<string, Set<string>>
  /** Maximum depth of indexing (number of path segments) */
  maxIndexDepth: number
}

/**
 * Maximum number of path segments to index.
 * Higher values = more memory but faster deep prefix queries.
 */
const MAX_INDEX_DEPTH = 4

// ============================================================================
// In-Memory Adapter Implementation
// ============================================================================

/**
 * In-memory implementation of the StorageAdapter interface.
 *
 * This adapter stores all data in JavaScript Maps, making it ideal for:
 * - Unit testing
 * - Integration testing
 * - Development environments
 * - Firebase Storage emulator
 *
 * @example
 * ```typescript
 * const adapter = new InMemoryAdapter()
 *
 * // Create a bucket
 * await adapter.createBucket('test-bucket')
 *
 * // Store an object
 * const metadata: StoredObjectMetadata = {
 *   name: 'hello.txt',
 *   bucket: 'test-bucket',
 *   generation: '1',
 *   metageneration: '1',
 *   contentType: 'text/plain',
 *   size: '5',
 *   md5Hash: 'XUFAKrxLKna5cZ2REBfFkg==',
 *   crc32c: 'aWS7Yw==',
 *   etag: '"1-XUFAKrxL"',
 *   timeCreated: new Date().toISOString(),
 *   updated: new Date().toISOString(),
 *   storageClass: 'STANDARD',
 * }
 *
 * await adapter.put('test-bucket', 'hello.txt', Buffer.from('Hello'), metadata)
 *
 * // Retrieve the object
 * const obj = await adapter.get('test-bucket', 'hello.txt')
 * console.log(obj?.data.toString()) // 'Hello'
 * ```
 */
export class InMemoryAdapter implements StorageAdapter {
  /** Storage: bucket name -> path -> StoredObject */
  private storage: Map<string, Map<string, StoredObject>>

  /** Per-bucket collection indexes for efficient prefix queries */
  private collectionIndexes: Map<string, CollectionIndex>

  constructor() {
    this.storage = new Map()
    this.collectionIndexes = new Map()
  }

  // ==========================================================================
  // Index Management
  // ==========================================================================

  /**
   * Get or create a collection index for a bucket
   */
  private getCollectionIndex(bucketName: string): CollectionIndex {
    if (!this.collectionIndexes.has(bucketName)) {
      this.collectionIndexes.set(bucketName, {
        prefixToObjects: new Map(),
        maxIndexDepth: MAX_INDEX_DEPTH,
      })
    }
    return this.collectionIndexes.get(bucketName)!
  }

  /**
   * Extract indexable prefixes from a path.
   * For path "users/123/files/doc.txt", returns:
   * - "users/"
   * - "users/123/"
   * - "users/123/files/"
   * - "users/123/files/doc.txt" (full path)
   */
  private extractPrefixes(path: string, maxDepth: number = MAX_INDEX_DEPTH): string[] {
    const prefixes: string[] = []
    const segments = path.split('/')

    // Generate prefixes for each depth level
    for (let i = 1; i <= Math.min(segments.length, maxDepth); i++) {
      const prefix = segments.slice(0, i).join('/') + (i < segments.length ? '/' : '')
      prefixes.push(prefix)
    }

    // Always include the full path
    if (!prefixes.includes(path)) {
      prefixes.push(path)
    }

    return prefixes
  }

  /**
   * Add an object path to the collection index
   */
  private indexObject(bucketName: string, path: string): void {
    const index = this.getCollectionIndex(bucketName)
    const prefixes = this.extractPrefixes(path, index.maxIndexDepth)

    for (const prefix of prefixes) {
      if (!index.prefixToObjects.has(prefix)) {
        index.prefixToObjects.set(prefix, new Set())
      }
      index.prefixToObjects.get(prefix)?.add(path)
    }
  }

  /**
   * Remove an object path from the collection index
   */
  private unindexObject(bucketName: string, path: string): void {
    const index = this.collectionIndexes.get(bucketName)
    if (!index) return

    const prefixes = this.extractPrefixes(path, index.maxIndexDepth)

    for (const prefix of prefixes) {
      const objects = index.prefixToObjects.get(prefix)
      if (objects) {
        objects.delete(path)
        // Clean up empty prefix entries
        if (objects.size === 0) {
          index.prefixToObjects.delete(prefix)
        }
      }
    }
  }

  /**
   * Find the best matching index for a given prefix.
   */
  private findBestIndexMatch(
    bucketName: string,
    queryPrefix: string
  ): { prefix: string; objects: Set<string> } | null {
    const index = this.collectionIndexes.get(bucketName)
    if (!index) return null

    // Try exact match first
    if (index.prefixToObjects.has(queryPrefix)) {
      return { prefix: queryPrefix, objects: index.prefixToObjects.get(queryPrefix)! }
    }

    // Try to find the longest matching indexed prefix
    const segments = queryPrefix.split('/').filter((s) => s !== '')
    for (let i = Math.min(segments.length, index.maxIndexDepth); i >= 1; i--) {
      const testPrefix = segments.slice(0, i).join('/') + '/'
      if (index.prefixToObjects.has(testPrefix)) {
        return { prefix: testPrefix, objects: index.prefixToObjects.get(testPrefix)! }
      }
    }

    return null
  }

  // ==========================================================================
  // Bucket Operations
  // ==========================================================================

  /**
   * Get the bucket map, optionally creating it if it doesn't exist
   */
  private getBucket(bucketName: string, createIfMissing: boolean = false): Map<string, StoredObject> | null {
    if (!this.storage.has(bucketName)) {
      if (createIfMissing) {
        this.storage.set(bucketName, new Map())
      } else {
        return null
      }
    }
    return this.storage.get(bucketName)!
  }

  async bucketExists(bucket: string): Promise<boolean> {
    return this.storage.has(bucket)
  }

  async createBucket(bucket: string): Promise<void> {
    if (!this.storage.has(bucket)) {
      this.storage.set(bucket, new Map())
    }
  }

  async deleteBucket(bucket: string): Promise<boolean> {
    const bucketMap = this.storage.get(bucket)
    if (!bucketMap) {
      return false
    }

    // Cannot delete non-empty bucket
    if (bucketMap.size > 0) {
      return false
    }

    this.storage.delete(bucket)
    this.collectionIndexes.delete(bucket)
    return true
  }

  // ==========================================================================
  // Object Operations
  // ==========================================================================

  async get(bucket: string, path: string, generation?: string): Promise<StoredObject | null> {
    const bucketMap = this.getBucket(bucket)
    if (!bucketMap) {
      return null
    }

    const stored = bucketMap.get(path)
    if (!stored) {
      return null
    }

    // If specific generation requested
    if (generation !== undefined) {
      if (stored.metadata.generation === generation) {
        return stored
      }
      // Check versions
      const version = stored.versions.get(generation)
      if (version) {
        return {
          data: version.data,
          metadata: version.metadata,
          versions: new Map(), // Don't expose nested versions
        }
      }
      return null
    }

    return stored
  }

  async put(
    bucket: string,
    path: string,
    data: Buffer,
    metadata: StoredObjectMetadata
  ): Promise<StoredObject> {
    // Ensure bucket exists
    const bucketMap = this.getBucket(bucket, true)!

    const existing = bucketMap.get(path)
    const versions = existing?.versions || new Map()

    // Store previous version if object existed
    if (existing) {
      versions.set(existing.metadata.generation, {
        data: existing.data,
        metadata: existing.metadata,
      })
    }

    const storedObject: StoredObject = {
      data,
      metadata,
      versions,
    }

    bucketMap.set(path, storedObject)

    // Index the object (only for new objects)
    if (!existing) {
      this.indexObject(bucket, path)
    }

    return storedObject
  }

  async delete(bucket: string, path: string, generation?: string): Promise<boolean> {
    const bucketMap = this.getBucket(bucket)
    if (!bucketMap) {
      return false
    }

    const stored = bucketMap.get(path)
    if (!stored) {
      return false
    }

    // If deleting specific generation
    if (generation !== undefined) {
      // If it's the current generation, delete the whole object
      if (stored.metadata.generation === generation) {
        bucketMap.delete(path)
        this.unindexObject(bucket, path)
        return true
      }

      // Otherwise try to delete from versions
      if (stored.versions.has(generation)) {
        stored.versions.delete(generation)
        return true
      }

      return false
    }

    // Delete the object
    bucketMap.delete(path)
    this.unindexObject(bucket, path)
    return true
  }

  async exists(bucket: string, path: string): Promise<boolean> {
    const bucketMap = this.getBucket(bucket)
    if (!bucketMap) {
      return false
    }
    return bucketMap.has(path)
  }

  async list(bucket: string, options?: AdapterListOptions): Promise<AdapterListResult> {
    const bucketMap = this.getBucket(bucket)
    if (!bucketMap) {
      return { items: [], prefixes: [] }
    }

    const items: StoredObject[] = []
    const prefixSet = new Set<string>()

    // Determine which paths to scan using the collection index
    let pathsToScan: Iterable<string>

    if (options?.prefix) {
      // Try to use the collection index for efficient prefix lookup
      const prefix = options.prefix
      const indexMatch = this.findBestIndexMatch(bucket, prefix)

      if (indexMatch) {
        // Use the index - filter the indexed paths that match our prefix
        pathsToScan = Array.from(indexMatch.objects).filter((path) =>
          path.startsWith(prefix)
        )
      } else {
        // Fall back to full scan if no index match
        pathsToScan = bucketMap.keys()
      }
    } else {
      // No prefix - need to scan all objects
      pathsToScan = bucketMap.keys()
    }

    // Collect all objects
    for (const path of pathsToScan) {
      const stored = bucketMap.get(path)
      if (!stored) continue

      // Filter by prefix (may be redundant if we used the index)
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
        const afterPrefix = options.prefix ? path.slice(options.prefix.length) : path
        const delimiterIndex = afterPrefix.indexOf(options.delimiter)

        if (delimiterIndex !== -1) {
          // This is a "directory" - add to prefixes
          const prefix =
            (options.prefix || '') + afterPrefix.slice(0, delimiterIndex + 1)
          prefixSet.add(prefix)
          continue
        }
      }

      // Add current version
      items.push(stored)

      // Add old versions if requested
      if (options?.versions) {
        for (const [gen, version] of stored.versions) {
          items.push({
            data: version.data,
            metadata: version.metadata,
            versions: new Map(),
          })
        }
      }
    }

    // Sort items by name
    items.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))

    // Handle pagination
    let startIndex = 0
    if (options?.pageToken) {
      try {
        startIndex = parseInt(Buffer.from(options.pageToken, 'base64').toString())
      } catch {
        // Invalid page token - start from beginning
        startIndex = 0
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

  async updateMetadata(
    bucket: string,
    path: string,
    updates: AdapterUpdateMetadataOptions
  ): Promise<StoredObject | null> {
    const bucketMap = this.getBucket(bucket)
    if (!bucketMap) {
      return null
    }

    const stored = bucketMap.get(path)
    if (!stored) {
      return null
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
      metadata:
        updates.metadata !== undefined
          ? Object.keys(updates.metadata).length > 0
            ? { ...updates.metadata }
            : undefined
          : stored.metadata.metadata,
    }

    return stored
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  async clear(): Promise<void> {
    this.storage.clear()
    this.collectionIndexes.clear()
  }

  async getStats(): Promise<AdapterStats> {
    let totalObjectCount = 0
    let totalSizeBytes = 0
    const buckets: Record<string, { objectCount: number; sizeBytes: number }> = {}

    for (const [bucketName, bucketMap] of this.storage) {
      let bucketObjectCount = 0
      let bucketSizeBytes = 0

      for (const [, obj] of bucketMap) {
        bucketObjectCount++
        bucketSizeBytes += obj.data.length

        // Also count versions
        for (const [, version] of obj.versions) {
          bucketObjectCount++
          bucketSizeBytes += version.data.length
        }
      }

      buckets[bucketName] = {
        objectCount: bucketObjectCount,
        sizeBytes: bucketSizeBytes,
      }

      totalObjectCount += bucketObjectCount
      totalSizeBytes += bucketSizeBytes
    }

    return {
      bucketCount: this.storage.size,
      objectCount: totalObjectCount,
      totalSizeBytes,
      buckets,
    }
  }

  // ==========================================================================
  // Additional Helper Methods
  // ==========================================================================

  /**
   * Get collection index statistics for a bucket.
   * Useful for debugging and monitoring index efficiency.
   */
  getCollectionIndexStats(
    bucketName: string
  ): {
    totalPrefixes: number
    totalIndexedPaths: number
    prefixBreakdown: Array<{ prefix: string; objectCount: number }>
  } | null {
    const index = this.collectionIndexes.get(bucketName)
    if (!index) return null

    const prefixBreakdown: Array<{ prefix: string; objectCount: number }> = []
    const uniquePaths = new Set<string>()

    for (const [prefix, objects] of index.prefixToObjects.entries()) {
      prefixBreakdown.push({ prefix, objectCount: objects.size })
      for (const path of objects) {
        uniquePaths.add(path)
      }
    }

    return {
      totalPrefixes: index.prefixToObjects.size,
      totalIndexedPaths: uniquePaths.size,
      prefixBreakdown: prefixBreakdown.sort((a, b) => b.objectCount - a.objectCount),
    }
  }

  /**
   * Rebuild the collection index for a bucket from existing storage.
   * Useful after importing data or recovering from corruption.
   */
  rebuildCollectionIndex(bucketName: string): void {
    // Clear existing index
    this.collectionIndexes.delete(bucketName)

    // Re-index all objects in the bucket
    const bucketMap = this.storage.get(bucketName)
    if (!bucketMap) return

    for (const path of bucketMap.keys()) {
      this.indexObject(bucketName, path)
    }
  }
}
