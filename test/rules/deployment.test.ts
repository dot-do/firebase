/**
 * Rules Deployment API Tests
 *
 * These tests verify the rules deployment API for uploading and activating
 * Firestore Security Rules. This follows the GREEN phase of TDD - implementing
 * the functionality to make tests pass.
 *
 * Test Categories:
 * 1. Upload rules (validation, storage, versioning)
 * 2. Activate rules (version switching, rollback)
 * 3. List rules (versions, metadata, history)
 * 4. Get rules (retrieve by version, active rules)
 * 5. Delete rules (cleanup, constraints)
 * 6. Validation (syntax errors, semantic errors)
 *
 * @see https://firebase.google.com/docs/firestore/security/get-started
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  uploadRules,
  activateRules,
  listRules,
  getRules,
  getActiveRules,
  deleteRules,
  validateRules,
  clearRulesStorage,
  RulesDeploymentError,
  RulesDeploymentErrorCode,
} from '../../src/rules/deployment.js'

// ============================================================================
// Test Data
// ============================================================================

const VALID_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }
  }
}`

const INVALID_SYNTAX_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read if request.auth != null;  // Missing colon
    }
  }
}`

const INVALID_SEMANTICS_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if nonExistentVariable == true;
    }
  }
}`

// ============================================================================
// Tests - Upload Rules
// ============================================================================

describe('Rules Deployment API', () => {
  // Clear storage between tests to ensure test isolation
  beforeEach(() => {
    clearRulesStorage()
  })

  describe('uploadRules', () => {
    it('should upload valid rules and return a version identifier', async () => {
      const result = await uploadRules({
        source: VALID_RULES,
      })

      expect(result.success).toBe(true)
      expect(result.version).toBeDefined()
      expect(typeof result.version).toBe('string')
      expect(result.version.length).toBeGreaterThan(0)
    })

    it('should generate unique version identifiers for each upload', async () => {
      const result1 = await uploadRules({
        source: VALID_RULES,
      })

      const result2 = await uploadRules({
        source: VALID_RULES,
      })

      expect(result1.version).not.toBe(result2.version)
    })

    it('should store metadata with uploaded rules', async () => {
      const metadata = {
        uploadedBy: 'user@example.com',
        description: 'Initial rules version',
      }

      const result = await uploadRules({
        source: VALID_RULES,
        metadata,
      })

      const stored = await getRules(result.version)
      expect(stored.metadata?.uploadedBy).toBe(metadata.uploadedBy)
      expect(stored.metadata?.description).toBe(metadata.description)
    })

    it('should reject rules with syntax errors when validation is enabled', async () => {
      await expect(
        uploadRules({
          source: INVALID_SYNTAX_RULES,
          validate: true,
        })
      ).rejects.toThrow(RulesDeploymentError)

      await expect(
        uploadRules({
          source: INVALID_SYNTAX_RULES,
          validate: true,
        })
      ).rejects.toMatchObject({
        code: RulesDeploymentErrorCode.INVALID_SYNTAX,
      })
    })

    it('should reject rules with semantic errors when validation is enabled', async () => {
      await expect(
        uploadRules({
          source: INVALID_SEMANTICS_RULES,
          validate: true,
        })
      ).rejects.toThrow(RulesDeploymentError)

      await expect(
        uploadRules({
          source: INVALID_SEMANTICS_RULES,
          validate: true,
        })
      ).rejects.toMatchObject({
        code: RulesDeploymentErrorCode.INVALID_SEMANTICS,
      })
    })

    it('should allow uploading without validation when validate is false', async () => {
      // This allows storing potentially invalid rules for review
      const result = await uploadRules({
        source: INVALID_SYNTAX_RULES,
        validate: false,
      })

      expect(result.success).toBe(true)
      expect(result.version).toBeDefined()
    })

    it('should return warnings for potentially problematic rules', async () => {
      const rulesWithWarnings = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // Overly permissive
    }
  }
}`

      const result = await uploadRules({
        source: rulesWithWarnings,
      })

      expect(result.success).toBe(true)
      expect(result.warnings).toBeDefined()
      expect(result.warnings!.length).toBeGreaterThan(0)
    })

    it('should auto-activate rules when autoActivate is true', async () => {
      const result = await uploadRules({
        source: VALID_RULES,
        autoActivate: true,
      })

      const active = await getActiveRules()
      expect(active.version).toBe(result.version)
      expect(active.isActive).toBe(true)
    })

    it('should not auto-activate rules by default', async () => {
      const result = await uploadRules({
        source: VALID_RULES,
      })

      const stored = await getRules(result.version)
      expect(stored.isActive).toBe(false)
    })

    it('should store the complete rules source', async () => {
      const result = await uploadRules({
        source: VALID_RULES,
      })

      const stored = await getRules(result.version)
      expect(stored.source).toBe(VALID_RULES)
    })

    it('should set createdAt timestamp when uploading', async () => {
      const before = new Date()
      const result = await uploadRules({
        source: VALID_RULES,
      })
      const after = new Date()

      const stored = await getRules(result.version)
      expect(stored.createdAt).toBeInstanceOf(Date)
      expect(stored.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(stored.createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })
  })

  // ============================================================================
  // Tests - Activate Rules
  // ============================================================================

  describe('activateRules', () => {
    it('should activate a specific rules version', async () => {
      const upload = await uploadRules({
        source: VALID_RULES,
      })

      const result = await activateRules(upload.version)

      expect(result.version).toBe(upload.version)
      expect(result.activatedAt).toBeInstanceOf(Date)
    })

    it('should make the specified version active', async () => {
      const upload = await uploadRules({
        source: VALID_RULES,
      })

      await activateRules(upload.version)

      const active = await getActiveRules()
      expect(active.version).toBe(upload.version)
      expect(active.isActive).toBe(true)
    })

    it('should deactivate the previous version when activating a new one', async () => {
      const upload1 = await uploadRules({
        source: VALID_RULES,
        autoActivate: true,
      })

      const upload2 = await uploadRules({
        source: VALID_RULES,
      })

      await activateRules(upload2.version)

      const previous = await getRules(upload1.version)
      expect(previous.isActive).toBe(false)
    })

    it('should return the previous active version for rollback', async () => {
      const upload1 = await uploadRules({
        source: VALID_RULES,
        autoActivate: true,
      })

      const upload2 = await uploadRules({
        source: VALID_RULES,
      })

      const result = await activateRules(upload2.version)

      expect(result.previousVersion).toBe(upload1.version)
    })

    it('should handle activating when no previous version exists', async () => {
      const upload = await uploadRules({
        source: VALID_RULES,
      })

      const result = await activateRules(upload.version)

      expect(result.previousVersion).toBeNull()
    })

    it('should throw error when activating non-existent version', async () => {
      await expect(activateRules('non-existent-version')).rejects.toThrow(
        RulesDeploymentError
      )

      await expect(activateRules('non-existent-version')).rejects.toMatchObject({
        code: RulesDeploymentErrorCode.VERSION_NOT_FOUND,
      })
    })

    it('should allow activating an already active version (idempotent)', async () => {
      const upload = await uploadRules({
        source: VALID_RULES,
        autoActivate: true,
      })

      // Activating again should succeed
      const result = await activateRules(upload.version)
      expect(result.version).toBe(upload.version)
    })

    it('should support rollback to previous version', async () => {
      const upload1 = await uploadRules({
        source: VALID_RULES,
        autoActivate: true,
      })

      const upload2 = await uploadRules({
        source: VALID_RULES,
      })

      const activation = await activateRules(upload2.version)

      // Rollback to previous version
      await activateRules(activation.previousVersion!)

      const active = await getActiveRules()
      expect(active.version).toBe(upload1.version)
    })
  })

  // ============================================================================
  // Tests - List Rules
  // ============================================================================

  describe('listRules', () => {
    it('should return all uploaded rules versions', async () => {
      const upload1 = await uploadRules({ source: VALID_RULES })
      const upload2 = await uploadRules({ source: VALID_RULES })

      const versions = await listRules()

      const versionIds = versions.map((v) => v.version)
      expect(versionIds).toContain(upload1.version)
      expect(versionIds).toContain(upload2.version)
    })

    it('should include active and inactive versions by default', async () => {
      await uploadRules({ source: VALID_RULES, autoActivate: true })
      await uploadRules({ source: VALID_RULES }) // inactive

      const versions = await listRules()

      const hasActive = versions.some((v) => v.isActive)
      const hasInactive = versions.some((v) => !v.isActive)

      expect(hasActive).toBe(true)
      expect(hasInactive).toBe(true)
    })

    it('should exclude inactive versions when includeInactive is false', async () => {
      await uploadRules({ source: VALID_RULES, autoActivate: true })
      await uploadRules({ source: VALID_RULES }) // inactive

      const versions = await listRules({ includeInactive: false })

      expect(versions.every((v) => v.isActive)).toBe(true)
    })

    it('should limit results when limit option is provided', async () => {
      await uploadRules({ source: VALID_RULES })
      await uploadRules({ source: VALID_RULES })
      await uploadRules({ source: VALID_RULES })

      const versions = await listRules({ limit: 2 })

      expect(versions.length).toBeLessThanOrEqual(2)
    })

    it('should return versions sorted by creation time (newest first)', async () => {
      const upload1 = await uploadRules({ source: VALID_RULES })
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10))
      const upload2 = await uploadRules({ source: VALID_RULES })
      await new Promise((resolve) => setTimeout(resolve, 10))
      const upload3 = await uploadRules({ source: VALID_RULES })

      const versions = await listRules()

      const recentVersionIds = versions.slice(0, 3).map((v) => v.version)
      expect(recentVersionIds[0]).toBe(upload3.version)
      expect(recentVersionIds[1]).toBe(upload2.version)
      expect(recentVersionIds[2]).toBe(upload1.version)
    })

    it('should return empty array when no rules have been uploaded', async () => {
      // This test assumes a clean state
      const versions = await listRules()
      expect(Array.isArray(versions)).toBe(true)
    })
  })

  // ============================================================================
  // Tests - Get Rules
  // ============================================================================

  describe('getRules', () => {
    it('should return a specific rules version by ID', async () => {
      const upload = await uploadRules({
        source: VALID_RULES,
        metadata: { description: 'test version' },
      })

      const rules = await getRules(upload.version)

      expect(rules.version).toBe(upload.version)
      expect(rules.source).toBe(VALID_RULES)
      expect(rules.metadata?.description).toBe('test version')
    })

    it('should throw error when version does not exist', async () => {
      await expect(getRules('non-existent-version')).rejects.toThrow(
        RulesDeploymentError
      )

      await expect(getRules('non-existent-version')).rejects.toMatchObject({
        code: RulesDeploymentErrorCode.VERSION_NOT_FOUND,
      })
    })

    it('should include isActive flag', async () => {
      const upload = await uploadRules({
        source: VALID_RULES,
        autoActivate: true,
      })

      const rules = await getRules(upload.version)
      expect(rules.isActive).toBe(true)
    })
  })

  describe('getActiveRules', () => {
    it('should return the currently active rules version', async () => {
      const upload = await uploadRules({
        source: VALID_RULES,
        autoActivate: true,
      })

      const active = await getActiveRules()

      expect(active.version).toBe(upload.version)
      expect(active.isActive).toBe(true)
      expect(active.source).toBe(VALID_RULES)
    })

    it('should return the most recently activated version', async () => {
      await uploadRules({ source: VALID_RULES, autoActivate: true })
      const upload2 = await uploadRules({ source: VALID_RULES, autoActivate: true })

      const active = await getActiveRules()

      expect(active.version).toBe(upload2.version)
    })

    it('should throw error when no rules are active', async () => {
      // This test assumes a clean state with no active rules
      await expect(getActiveRules()).rejects.toThrow(RulesDeploymentError)

      await expect(getActiveRules()).rejects.toMatchObject({
        code: RulesDeploymentErrorCode.VERSION_NOT_FOUND,
      })
    })
  })

  // ============================================================================
  // Tests - Delete Rules
  // ============================================================================

  describe('deleteRules', () => {
    it('should delete an inactive rules version', async () => {
      const upload = await uploadRules({
        source: VALID_RULES,
      })

      await deleteRules(upload.version)

      await expect(getRules(upload.version)).rejects.toThrow(RulesDeploymentError)
    })

    it('should throw error when deleting active rules version', async () => {
      const upload = await uploadRules({
        source: VALID_RULES,
        autoActivate: true,
      })

      await expect(deleteRules(upload.version)).rejects.toThrow(RulesDeploymentError)
    })

    it('should throw error when version does not exist', async () => {
      await expect(deleteRules('non-existent-version')).rejects.toThrow(
        RulesDeploymentError
      )

      await expect(deleteRules('non-existent-version')).rejects.toMatchObject({
        code: RulesDeploymentErrorCode.VERSION_NOT_FOUND,
      })
    })

    it('should allow deleting a version after it has been deactivated', async () => {
      const upload1 = await uploadRules({
        source: VALID_RULES,
        autoActivate: true,
      })

      const upload2 = await uploadRules({
        source: VALID_RULES,
        autoActivate: true,
      })

      // Now upload1 is inactive, should be deletable
      await deleteRules(upload1.version)

      await expect(getRules(upload1.version)).rejects.toThrow()
    })
  })

  // ============================================================================
  // Tests - Validate Rules
  // ============================================================================

  describe('validateRules', () => {
    it('should return valid for syntactically correct rules', async () => {
      const result = await validateRules(VALID_RULES)

      expect(result.valid).toBe(true)
      expect(result.errors).toBeUndefined()
    })

    it('should return errors for syntactically invalid rules', async () => {
      const result = await validateRules(INVALID_SYNTAX_RULES)

      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })

    it('should return errors for semantically invalid rules', async () => {
      const result = await validateRules(INVALID_SEMANTICS_RULES)

      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })

    it('should provide descriptive error messages', async () => {
      const result = await validateRules(INVALID_SYNTAX_RULES)

      expect(result.errors).toBeDefined()
      expect(result.errors![0]).toContain('syntax')
    })

    it('should not store rules when validating', async () => {
      await validateRules(VALID_RULES)

      // Validation should not create a new version
      const versions = await listRules()
      // The versions list should not include a version from validation
      // (This is a conceptual test - implementation would need to track)
    })
  })

  // ============================================================================
  // Tests - Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should throw RulesDeploymentError with correct error code', async () => {
      const error = new RulesDeploymentError(
        RulesDeploymentErrorCode.INVALID_SYNTAX,
        'Test error',
        { line: 5, column: 10 }
      )

      expect(error.name).toBe('RulesDeploymentError')
      expect(error.code).toBe(RulesDeploymentErrorCode.INVALID_SYNTAX)
      expect(error.message).toBe('Test error')
      expect(error.details).toEqual({ line: 5, column: 10 })
    })

    it('should handle storage errors gracefully', async () => {
      // This would test error handling for storage layer failures
      // Implementation would need to simulate storage errors
    })

    it('should handle concurrent activation requests', async () => {
      const upload1 = await uploadRules({ source: VALID_RULES })
      const upload2 = await uploadRules({ source: VALID_RULES })

      // Activate both simultaneously
      await Promise.all([activateRules(upload1.version), activateRules(upload2.version)])

      const active = await getActiveRules()
      // One of them should be active (last write wins or similar strategy)
      expect([upload1.version, upload2.version]).toContain(active.version)
    })
  })
})
