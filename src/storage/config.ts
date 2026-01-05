/**
 * Firebase Storage Configuration
 *
 * Configurable settings for the storage emulator including memory limits,
 * cleanup intervals, and other operational parameters.
 */

// ============================================================================
// Configuration Interface
// ============================================================================

/**
 * Configuration options for the storage emulator
 */
export interface StorageConfig {
  /**
   * Maximum size in bytes for a single upload (default: 100MB)
   * Uploads exceeding this limit will be rejected with RESOURCE_EXHAUSTED
   */
  maxUploadSizeBytes: number

  /**
   * Maximum size in bytes for resumable upload sessions (default: 5GB)
   * This is the maximum total file size for resumable uploads
   */
  maxResumableUploadSizeBytes: number

  /**
   * Maximum memory to use for in-progress resumable uploads (default: 500MB)
   * When this limit is reached, new uploads will be rejected
   */
  maxResumableUploadMemoryBytes: number

  /**
   * Interval in milliseconds to run stale session cleanup (default: 5 minutes)
   */
  cleanupIntervalMs: number

  /**
   * Maximum age in milliseconds for idle upload sessions before cleanup (default: 1 hour)
   * Sessions with no activity for this duration will be cleaned up
   */
  sessionIdleTimeoutMs: number

  /**
   * Whether to enable automatic cleanup of stale sessions (default: true)
   */
  enableAutoCleanup: boolean

  /**
   * Maximum number of concurrent resumable upload sessions (default: 1000)
   */
  maxConcurrentResumableSessions: number

  /**
   * Chunk size threshold for incremental processing (default: 1MB)
   * Chunks larger than this will be processed incrementally
   */
  incrementalProcessingThresholdBytes: number
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default storage configuration values
 */
export const DEFAULT_CONFIG: StorageConfig = {
  // 100MB max upload size for simple uploads
  maxUploadSizeBytes: 100 * 1024 * 1024,

  // 5TB max resumable upload size (Firebase Storage limit)
  // This matches the MAX_FILE_SIZE constant in resumable.ts
  maxResumableUploadSizeBytes: 5 * 1024 * 1024 * 1024 * 1024,

  // 500MB max memory for all in-progress resumable uploads
  maxResumableUploadMemoryBytes: 500 * 1024 * 1024,

  // Run cleanup every 5 minutes
  cleanupIntervalMs: 5 * 60 * 1000,

  // Clean up sessions idle for more than 1 hour
  sessionIdleTimeoutMs: 60 * 60 * 1000,

  // Enable automatic cleanup by default
  enableAutoCleanup: true,

  // Allow up to 1000 concurrent resumable sessions
  maxConcurrentResumableSessions: 1000,

  // Process chunks larger than 1MB incrementally
  incrementalProcessingThresholdBytes: 1024 * 1024,
}

// ============================================================================
// Configuration State
// ============================================================================

/**
 * Current active configuration (mutable)
 */
let currentConfig: StorageConfig = { ...DEFAULT_CONFIG }

/**
 * Get the current storage configuration
 */
export function getStorageConfig(): Readonly<StorageConfig> {
  return currentConfig
}

/**
 * Update the storage configuration
 * @param updates Partial configuration updates
 */
export function updateStorageConfig(updates: Partial<StorageConfig>): void {
  currentConfig = { ...currentConfig, ...updates }
}

/**
 * Reset configuration to defaults
 */
export function resetStorageConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG }
}

// ============================================================================
// Memory Tracking
// ============================================================================

/**
 * Tracks current memory usage across all resumable upload sessions
 */
let currentResumableMemoryUsage = 0

/**
 * Get current memory usage for resumable uploads
 */
export function getResumableMemoryUsage(): number {
  return currentResumableMemoryUsage
}

/**
 * Add to the tracked memory usage
 * @param bytes Number of bytes to add
 * @returns true if the memory was allocated, false if it would exceed limits
 */
export function allocateResumableMemory(bytes: number): boolean {
  const config = getStorageConfig()
  if (currentResumableMemoryUsage + bytes > config.maxResumableUploadMemoryBytes) {
    return false
  }
  currentResumableMemoryUsage += bytes
  return true
}

/**
 * Release tracked memory usage
 * @param bytes Number of bytes to release
 */
export function releaseResumableMemory(bytes: number): void {
  currentResumableMemoryUsage = Math.max(0, currentResumableMemoryUsage - bytes)
}

/**
 * Reset memory tracking (for testing)
 */
export function resetMemoryTracking(): void {
  currentResumableMemoryUsage = 0
}

// ============================================================================
// Error Messages
// ============================================================================

export const StorageConfigErrors = {
  UPLOAD_TOO_LARGE: (size: number, maxSize: number) =>
    `Upload size ${formatBytes(size)} exceeds maximum allowed size of ${formatBytes(maxSize)}`,

  MEMORY_LIMIT_EXCEEDED: (currentUsage: number, maxUsage: number) =>
    `Memory limit exceeded. Current usage: ${formatBytes(currentUsage)}, Maximum: ${formatBytes(maxUsage)}`,

  MAX_SESSIONS_EXCEEDED: (current: number, max: number) =>
    `Maximum concurrent upload sessions (${max}) exceeded. Current: ${current}`,

  RESUMABLE_UPLOAD_TOO_LARGE: (size: number, maxSize: number) =>
    `Resumable upload size ${formatBytes(size)} exceeds maximum allowed size of ${formatBytes(maxSize)}`,
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`
}
