/**
 * Firebase Storage Configuration
 *
 * Configurable settings for the storage emulator including memory limits,
 * cleanup intervals, and other operational parameters.
 */

import { verifyFirebaseToken, type VerifiedTokenPayload } from '../auth/jwt.js'

// ============================================================================
// Auth Context Types
// ============================================================================

/**
 * Security mode for storage access control
 */
export type StorageSecurityMode =
  | 'open'           // No authentication required (for development/testing)
  | 'authenticated'  // Requires valid Firebase auth token
  | 'rules'          // Evaluates Firebase Security Rules (most restrictive)

/**
 * Authentication context for storage operations
 */
export interface StorageAuthContext {
  /** Authenticated user ID */
  uid: string
  /** User email (if available) */
  email?: string
  /** Whether email is verified */
  emailVerified?: boolean
  /** Custom claims from the JWT token */
  claims?: Record<string, unknown>
  /** Raw verified token payload */
  token: VerifiedTokenPayload
}

/**
 * Result of auth verification
 */
export interface AuthVerificationResult {
  success: boolean
  auth?: StorageAuthContext
  error?: string
  httpStatus?: number
}

// ============================================================================
// Configuration Interface
// ============================================================================

/**
 * Configuration options for the storage emulator
 */
export interface StorageConfig {
  /**
   * Security mode for access control (default: 'open')
   * - 'open': No authentication required (development mode)
   * - 'authenticated': Requires valid Firebase auth token
   * - 'rules': Evaluates Firebase Security Rules
   */
  securityMode: StorageSecurityMode

  /**
   * Firebase project ID for token verification
   */
  projectId?: string

  /**
   * Secret key for signing download URLs (HMAC-SHA256)
   * If not provided, a random key will be generated on startup.
   * In production, this should be set to a persistent secret.
   */
  urlSigningSecret?: string

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
  // Open security mode by default (for development/emulator)
  securityMode: 'open',

  // Project ID (should be set in production)
  projectId: undefined,

  // URL signing secret (generated on first use if not provided)
  urlSigningSecret: undefined,

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
// URL Signing Secret
// ============================================================================

import { randomBytes } from 'crypto'

/**
 * Cached generated signing secret (for when none is configured)
 */
let generatedSigningSecret: string | null = null

/**
 * Gets the URL signing secret, generating one if not configured.
 * The secret is used for HMAC-SHA256 signing of download URLs.
 *
 * @returns The URL signing secret (32 bytes, hex-encoded = 64 chars)
 */
export function getUrlSigningSecret(): string {
  const config = getStorageConfig()

  // Use configured secret if available
  if (config.urlSigningSecret) {
    return config.urlSigningSecret
  }

  // Generate a random secret if not configured (persists for session)
  if (!generatedSigningSecret) {
    generatedSigningSecret = randomBytes(32).toString('hex')
  }

  return generatedSigningSecret
}

/**
 * Reset the generated signing secret (for testing)
 */
export function resetUrlSigningSecret(): void {
  generatedSigningSecret = null
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

// ============================================================================
// Auth Verification
// ============================================================================

/**
 * Verify a Firebase auth token and return auth context
 *
 * @param authHeader - Authorization header value (e.g., "Bearer <token>")
 * @returns Auth verification result with context on success
 */
export async function verifyStorageAuth(
  authHeader?: string
): Promise<AuthVerificationResult> {
  const config = getStorageConfig()

  // In 'open' mode, no auth required
  if (config.securityMode === 'open') {
    return { success: true }
  }

  // Check for auth header
  if (!authHeader) {
    return {
      success: false,
      error: 'Authentication required',
      httpStatus: 401,
    }
  }

  // Parse Bearer token
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return {
      success: false,
      error: 'Invalid authorization header format',
      httpStatus: 401,
    }
  }

  const token = match[1]

  // Need project ID for token verification
  if (!config.projectId) {
    return {
      success: false,
      error: 'Storage not configured: missing projectId',
      httpStatus: 500,
    }
  }

  try {
    const payload = await verifyFirebaseToken(token, config.projectId)

    const auth: StorageAuthContext = {
      uid: payload.user_id,
      email: payload.email,
      emailVerified: payload.email_verified,
      claims: Object.fromEntries(
        Object.entries(payload).filter(
          ([key]) => !['iss', 'aud', 'sub', 'user_id', 'exp', 'iat', 'auth_time', 'firebase'].includes(key)
        )
      ),
      token: payload,
    }

    return { success: true, auth }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token verification failed'

    if (message === 'TOKEN_EXPIRED') {
      return {
        success: false,
        error: 'Token expired',
        httpStatus: 401,
      }
    }

    return {
      success: false,
      error: message,
      httpStatus: 401,
    }
  }
}

/**
 * Check if operation is allowed based on security mode and auth context
 *
 * @param operation - The operation being performed (read, write, delete)
 * @param bucket - The bucket name
 * @param path - The object path
 * @param auth - Optional auth context
 * @returns Whether the operation is allowed
 */
export function checkStoragePermission(
  operation: 'read' | 'write' | 'delete',
  bucket: string,
  path: string,
  auth?: StorageAuthContext
): { allowed: boolean; error?: string; httpStatus?: number } {
  const config = getStorageConfig()

  // Open mode: everything allowed
  if (config.securityMode === 'open') {
    return { allowed: true }
  }

  // Authenticated mode: just check that user is authenticated
  if (config.securityMode === 'authenticated') {
    if (!auth) {
      return {
        allowed: false,
        error: 'Authentication required',
        httpStatus: 401,
      }
    }
    return { allowed: true }
  }

  // Rules mode: evaluate Firebase Security Rules
  // For now, implement basic owner-based rules
  // Full rules evaluation would integrate with src/rules/evaluator.ts
  if (config.securityMode === 'rules') {
    if (!auth) {
      return {
        allowed: false,
        error: 'Authentication required',
        httpStatus: 401,
      }
    }

    // Basic rule: users can only access objects under their UID path
    // e.g., users/{uid}/** is writable/readable by that user
    const userPathMatch = path.match(/^users\/([^\/]+)\//)
    if (userPathMatch) {
      if (userPathMatch[1] !== auth.uid) {
        return {
          allowed: false,
          error: `Permission denied: cannot ${operation} other user's files`,
          httpStatus: 403,
        }
      }
    }

    // Public read paths (e.g., public/**)
    if (path.startsWith('public/') && operation === 'read') {
      return { allowed: true }
    }

    // Default: require matching user path for write/delete
    if (operation !== 'read' && !userPathMatch) {
      return {
        allowed: false,
        error: 'Permission denied: no write access to this path',
        httpStatus: 403,
      }
    }

    return { allowed: true }
  }

  return { allowed: true }
}
