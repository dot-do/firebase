/**
 * Firebase Storage Module
 *
 * Re-exports all public APIs from the storage module.
 */

// Object operations
export {
  uploadObject,
  downloadObject,
  deleteObject,
  deleteObjects,
  getMetadata,
  updateMetadata,
  listObjects,
  copyObject,
  detectContentType,
  getDownloadUrl,
  StorageError,
  StorageErrorCode,
  type UploadOptions,
  type DownloadOptions,
  type DownloadResult,
  type ObjectMetadata,
  type UpdateMetadataOptions,
  type ListOptions,
  type ListResult,
  type CopyOptions,
  type DeleteOptions,
} from './objects.js'

// Resumable upload operations
export {
  initiateResumableUpload,
  resumeUpload,
  getUploadStatus,
  cancelUpload,
  completeUpload,
  cleanupStaleSessions,
  startCleanupTimer,
  stopCleanupTimer,
  getUploadSessionStats,
  resetUploadSessions,
  ResumableUploadError,
  ResumableUploadErrorCode,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  DEFAULT_CHUNK_SIZE,
  MAX_FILE_SIZE,
  UPLOAD_SESSION_DURATION_MS,
  type UploadMetadata,
  type InitiateUploadOptions,
  type InitiateUploadResult,
  type ResumeUploadOptions,
  type ResumeUploadResult,
  type UploadStatus,
  type CompleteUploadOptions,
  type CompletedUploadMetadata,
  type CancelUploadOptions,
  type CleanupResult,
} from './resumable.js'

// Configuration
export {
  getStorageConfig,
  updateStorageConfig,
  resetStorageConfig,
  getResumableMemoryUsage,
  resetMemoryTracking,
  getUrlSigningSecret,
  resetUrlSigningSecret,
  DEFAULT_CONFIG,
  type StorageConfig,
  type StorageSecurityMode,
} from './config.js'

// Auth and Access Control
export {
  verifyStorageAuth,
  checkStoragePermission,
  type StorageAuthContext,
  type AuthVerificationResult,
} from './config.js'
