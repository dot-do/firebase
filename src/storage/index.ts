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
} from './resumable.js'
