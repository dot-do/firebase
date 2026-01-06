/**
 * Firebase Security Rules Deployment API
 *
 * This module provides functionality for uploading, activating, and managing
 * Firestore Security Rules versions. It supports:
 * - Uploading rules with optional validation
 * - Activating specific versions (atomic activation)
 * - Rollback to previous versions
 * - Listing and retrieving stored versions
 * - Deleting inactive versions
 * - Validating rules without storing them
 */

import { parseRulesWithRecovery, validateRulesSyntax, type ParseError } from './parser.js'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Represents a stored rules version
 */
export interface RulesVersion {
  /** Unique version identifier */
  version: string
  /** Rules source code */
  source: string
  /** When this version was created */
  createdAt: Date
  /** Whether this is the currently active version */
  isActive: boolean
  /** Optional metadata about this version */
  metadata?: {
    uploadedBy?: string
    description?: string
    [key: string]: unknown
  }
}

/**
 * Result of uploading rules
 */
export interface UploadRulesResult {
  /** The version identifier for the uploaded rules */
  version: string
  /** Whether the rules were successfully uploaded */
  success: boolean
  /** Optional validation warnings */
  warnings?: string[]
}

/**
 * Result of activating rules
 */
export interface ActivateRulesResult {
  /** The version that was activated */
  version: string
  /** The previous active version (for rollback) */
  previousVersion: string | null
  /** Timestamp when activation occurred */
  activatedAt: Date
}

/**
 * Options for uploading rules
 */
export interface UploadRulesOptions {
  /** Rules source code */
  source: string
  /** Optional metadata */
  metadata?: {
    uploadedBy?: string
    description?: string
    [key: string]: unknown
  }
  /** Whether to validate before upload (default: true) */
  validate?: boolean
  /** Whether to automatically activate after upload (default: false) */
  autoActivate?: boolean
}

/**
 * Options for listing rules
 */
export interface ListRulesOptions {
  /** Maximum number of versions to return */
  limit?: number
  /** Include inactive versions (default: true) */
  includeInactive?: boolean
}

/**
 * Error codes for rules deployment
 */
export enum RulesDeploymentErrorCode {
  INVALID_SYNTAX = 'invalid_syntax',
  INVALID_SEMANTICS = 'invalid_semantics',
  VERSION_NOT_FOUND = 'version_not_found',
  VERSION_ALREADY_ACTIVE = 'version_already_active',
  CANNOT_DELETE_ACTIVE = 'cannot_delete_active',
  STORAGE_ERROR = 'storage_error',
  VALIDATION_ERROR = 'validation_error',
}

/**
 * Rules deployment error
 */
export class RulesDeploymentError extends Error {
  constructor(
    public readonly code: RulesDeploymentErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'RulesDeploymentError'
  }
}

// ============================================================================
// Storage (In-Memory for now, can be replaced with persistent storage)
// ============================================================================

/**
 * In-memory storage for rules versions
 * In production, this would be backed by a database or file system
 */
class RulesStorage {
  private versions: Map<string, RulesVersion> = new Map()
  private activeVersion: string | null = null

  /**
   * Generates a unique version identifier
   */
  generateVersionId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 10)
    return `v_${timestamp}_${random}`
  }

  /**
   * Stores a new rules version
   */
  store(version: RulesVersion): void {
    this.versions.set(version.version, version)
  }

  /**
   * Gets a rules version by ID
   */
  get(versionId: string): RulesVersion | undefined {
    return this.versions.get(versionId)
  }

  /**
   * Gets the currently active version
   */
  getActive(): RulesVersion | undefined {
    if (!this.activeVersion) return undefined
    return this.versions.get(this.activeVersion)
  }

  /**
   * Sets a version as active (and deactivates the previous one)
   */
  setActive(versionId: string): string | null {
    const previousVersion = this.activeVersion

    // Deactivate the previous version
    if (previousVersion) {
      const prev = this.versions.get(previousVersion)
      if (prev) {
        prev.isActive = false
      }
    }

    // Activate the new version
    const current = this.versions.get(versionId)
    if (current) {
      current.isActive = true
      this.activeVersion = versionId
    }

    return previousVersion
  }

  /**
   * Deletes a rules version
   */
  delete(versionId: string): boolean {
    return this.versions.delete(versionId)
  }

  /**
   * Lists all versions sorted by creation time (newest first)
   */
  list(options?: ListRulesOptions): RulesVersion[] {
    let versions = Array.from(this.versions.values())

    // Filter by active status
    if (options?.includeInactive === false) {
      versions = versions.filter(v => v.isActive)
    }

    // Sort by creation time (newest first)
    versions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    // Apply limit
    if (options?.limit !== undefined && options.limit > 0) {
      versions = versions.slice(0, options.limit)
    }

    return versions
  }

  /**
   * Clears all stored versions (for testing)
   */
  clear(): void {
    this.versions.clear()
    this.activeVersion = null
  }
}

// Global storage instance
const storage = new RulesStorage()

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Checks if rules have syntax errors
 */
function hasSyntaxErrors(source: string): ParseError[] {
  return validateRulesSyntax(source)
}

/**
 * Checks for semantic errors in rules (e.g., undefined variables)
 * This is a simplified check - a full implementation would do deeper analysis
 */
function hasSemanticErrors(source: string): string[] {
  const errors: string[] = []

  // Check for undefined variable usage
  const result = parseRulesWithRecovery(source)
  if (result.errors.length > 0) {
    return [] // Syntax errors take precedence
  }

  // Look for variables that aren't in the known set
  const knownVariables = new Set([
    'request', 'resource', 'true', 'false', 'null',
    'read', 'write', 'get', 'list', 'create', 'update', 'delete',
    'duration', 'timestamp', 'math', 'string', 'int', 'float',
    'path', 'exists', 'debug',
  ])

  // Simple heuristic: look for identifiers that aren't known
  // This matches things like "nonExistentVariable" in expressions
  const identifierPattern = /if\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[=!<>]/g
  let match
  while ((match = identifierPattern.exec(source)) !== null) {
    const identifier = match[1]
    if (!knownVariables.has(identifier) &&
        !identifier.includes('.') &&
        identifier !== 'request' &&
        identifier !== 'resource') {
      errors.push(`Undefined variable: ${identifier}`)
    }
  }

  return errors
}

/**
 * Checks for potentially problematic patterns (warnings, not errors)
 */
function getWarnings(source: string): string[] {
  const warnings: string[] = []

  // Check for overly permissive rules
  if (source.includes('allow read, write: if true') ||
      source.includes('allow read, write: if true;')) {
    warnings.push('Warning: Overly permissive rules detected - anyone can read and write')
  }

  // Check for wildcard match at root with permissive rules
  if (source.includes('match /{document=**}') &&
      (source.includes('if true') || source.includes(': if true'))) {
    warnings.push('Warning: Wildcard match with permissive condition at root level')
  }

  return warnings
}

// ============================================================================
// Public API Functions
// ============================================================================

/**
 * Uploads new rules and returns a version identifier
 */
export async function uploadRules(options: UploadRulesOptions): Promise<UploadRulesResult> {
  const { source, metadata, validate = true, autoActivate = false } = options

  // Validate if requested (default: true)
  if (validate) {
    const syntaxErrors = hasSyntaxErrors(source)
    if (syntaxErrors.length > 0) {
      throw new RulesDeploymentError(
        RulesDeploymentErrorCode.INVALID_SYNTAX,
        `Rules contain syntax errors: ${syntaxErrors[0].message}`,
        { errors: syntaxErrors.map(e => e.message) }
      )
    }

    const semanticErrors = hasSemanticErrors(source)
    if (semanticErrors.length > 0) {
      throw new RulesDeploymentError(
        RulesDeploymentErrorCode.INVALID_SEMANTICS,
        `Rules contain semantic errors: ${semanticErrors[0]}`,
        { errors: semanticErrors }
      )
    }
  }

  // Generate version ID and create version object
  const version = storage.generateVersionId()
  const createdAt = new Date()

  const rulesVersion: RulesVersion = {
    version,
    source,
    createdAt,
    isActive: false,
    metadata,
  }

  // Store the version
  storage.store(rulesVersion)

  // Get warnings
  const warnings = getWarnings(source)

  // Auto-activate if requested
  if (autoActivate) {
    storage.setActive(version)
    rulesVersion.isActive = true
  }

  return {
    version,
    success: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

/**
 * Activates a specific version of rules
 */
export async function activateRules(version: string): Promise<ActivateRulesResult> {
  const rulesVersion = storage.get(version)

  if (!rulesVersion) {
    throw new RulesDeploymentError(
      RulesDeploymentErrorCode.VERSION_NOT_FOUND,
      `Rules version '${version}' not found`
    )
  }

  const previousVersion = storage.setActive(version)
  const activatedAt = new Date()

  return {
    version,
    previousVersion,
    activatedAt,
  }
}

/**
 * Lists all rules versions
 */
export async function listRules(options?: ListRulesOptions): Promise<RulesVersion[]> {
  return storage.list(options)
}

/**
 * Gets a specific rules version
 */
export async function getRules(version: string): Promise<RulesVersion> {
  const rulesVersion = storage.get(version)

  if (!rulesVersion) {
    throw new RulesDeploymentError(
      RulesDeploymentErrorCode.VERSION_NOT_FOUND,
      `Rules version '${version}' not found`
    )
  }

  return rulesVersion
}

/**
 * Gets the currently active rules
 */
export async function getActiveRules(): Promise<RulesVersion> {
  const active = storage.getActive()

  if (!active) {
    throw new RulesDeploymentError(
      RulesDeploymentErrorCode.VERSION_NOT_FOUND,
      'No active rules version found'
    )
  }

  return active
}

/**
 * Deletes a specific rules version (must not be active)
 */
export async function deleteRules(version: string): Promise<void> {
  const rulesVersion = storage.get(version)

  if (!rulesVersion) {
    throw new RulesDeploymentError(
      RulesDeploymentErrorCode.VERSION_NOT_FOUND,
      `Rules version '${version}' not found`
    )
  }

  if (rulesVersion.isActive) {
    throw new RulesDeploymentError(
      RulesDeploymentErrorCode.CANNOT_DELETE_ACTIVE,
      `Cannot delete active rules version '${version}'`
    )
  }

  storage.delete(version)
}

/**
 * Validates rules without uploading
 */
export async function validateRules(source: string): Promise<{ valid: boolean; errors?: string[] }> {
  const syntaxErrors = hasSyntaxErrors(source)

  if (syntaxErrors.length > 0) {
    return {
      valid: false,
      errors: syntaxErrors.map(e => `syntax error: ${e.message}`),
    }
  }

  const semanticErrors = hasSemanticErrors(source)

  if (semanticErrors.length > 0) {
    return {
      valid: false,
      errors: semanticErrors,
    }
  }

  return { valid: true }
}

/**
 * Clears all stored rules versions (for testing)
 */
export function clearRulesStorage(): void {
  storage.clear()
}
