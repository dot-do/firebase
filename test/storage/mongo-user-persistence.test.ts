/**
 * MongoDB User Persistence Tests
 *
 * RED TESTS: These tests verify user CRUD operations with MongoDB persistence.
 * Currently, user data is stored in-memory (users.ts), and these tests will FAIL
 * until MongoDB persistence is implemented via mongo.do integration.
 *
 * Issue: firebase-zh9 - [RED] auth.do: Test user persistence in mongo.do
 * Blocks: firebase-43x - [GREEN] auth.do: Implement user storage with mongo.do
 *
 * Expected behavior:
 * 1. Users should be persisted to MongoDB, not just in-memory
 * 2. User data should survive server restarts
 * 3. User lookups should query MongoDB
 * 4. User updates should persist to MongoDB
 * 5. User deletion should remove from MongoDB
 *
 * Architecture:
 * - auth.do handles authentication logic
 * - mongo.do provides MongoDB storage backend
 * - Users are stored in a "users" collection
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'

// ============================================================================
// Type Definitions for MongoDB User Storage
// ============================================================================

/**
 * User document as stored in MongoDB
 * This extends the existing UserRecord with MongoDB-specific fields
 */
interface MongoUserDocument {
  _id: string // MongoDB document ID (same as localId)
  localId: string
  email?: string
  emailVerified: boolean
  displayName?: string
  photoUrl?: string
  passwordHash?: string
  passwordSalt?: string
  passwordUpdatedAt?: number
  providerUserInfo: Array<{
    providerId: string
    federatedId?: string
    email?: string
    displayName?: string
    photoUrl?: string
  }>
  validSince?: string
  disabled: boolean
  lastLoginAt?: string
  createdAt: string
  lastRefreshAt?: string
  updatedAt?: string // MongoDB-specific: tracks last update time
}

/**
 * Expected interface for MongoDB user storage operations
 * This is the contract that mongo.do should implement
 */
interface MongoUserStorage {
  // Create a new user document
  createUser(user: MongoUserDocument): Promise<MongoUserDocument>

  // Find user by ID (localId)
  findUserById(localId: string): Promise<MongoUserDocument | null>

  // Find user by email
  findUserByEmail(email: string): Promise<MongoUserDocument | null>

  // Update user document
  updateUser(localId: string, updates: Partial<MongoUserDocument>): Promise<MongoUserDocument | null>

  // Delete user document
  deleteUser(localId: string): Promise<boolean>

  // Count total users (for testing)
  countUsers(): Promise<number>

  // Clear all users (for testing)
  clearAllUsers(): Promise<void>
}

// ============================================================================
// MongoDB User Storage Module Tests
// ============================================================================

describe('MongoDB User Storage Module', () => {
  /**
   * RED TEST: The MongoUserStorage module should be exported from mongo.do
   *
   * This test verifies that the MongoDB user storage interface is available.
   * It should fail until the mongo.do module exports user storage functionality.
   */
  it('should export MongoUserStorage class from mongo.do', async () => {
    // Dynamically import to test if the export exists
    const mongoModule = await import('../../src/storage/mongo.js')

    // The module should export a MongoUserStorage class or factory
    expect(mongoModule).toHaveProperty('MongoUserStorage')
    expect(typeof mongoModule.MongoUserStorage).toBe('function')
  })

  it('should export createMongoUserStorage factory function', async () => {
    const mongoModule = await import('../../src/storage/mongo.js')

    // Should have a factory function to create user storage instance
    expect(mongoModule).toHaveProperty('createMongoUserStorage')
    expect(typeof mongoModule.createMongoUserStorage).toBe('function')
  })
})

// ============================================================================
// User CRUD Operations Tests
// ============================================================================

describe('MongoDB User CRUD Operations', () => {
  // NOTE: These tests will fail until MongoDB storage is implemented
  // They serve as specifications for the expected behavior

  /**
   * Test helper: Creates a test user document
   */
  function createTestUserDocument(overrides: Partial<MongoUserDocument> = {}): MongoUserDocument {
    const now = Date.now().toString()
    const localId = `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`

    return {
      _id: localId,
      localId,
      email: `${localId}@example.com`,
      emailVerified: false,
      passwordHash: 'test-hash',
      passwordSalt: 'test-salt',
      passwordUpdatedAt: Date.now(),
      providerUserInfo: [],
      disabled: false,
      createdAt: now,
      lastLoginAt: now,
      ...overrides,
    }
  }

  describe('createUser', () => {
    /**
     * RED TEST: Should persist user to MongoDB
     */
    it('should persist user document to MongoDB', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const userDoc = createTestUserDocument()
      const created = await storage.createUser(userDoc)

      expect(created).toBeDefined()
      expect(created._id).toBe(userDoc.localId)
      expect(created.email).toBe(userDoc.email)
      expect(created.localId).toBe(userDoc.localId)
    })

    /**
     * RED TEST: Should return created user with all fields
     */
    it('should return the created user with all fields preserved', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const userDoc = createTestUserDocument({
        displayName: 'Test User',
        photoUrl: 'https://example.com/photo.jpg',
        emailVerified: true,
      })

      const created = await storage.createUser(userDoc)

      expect(created.displayName).toBe('Test User')
      expect(created.photoUrl).toBe('https://example.com/photo.jpg')
      expect(created.emailVerified).toBe(true)
      expect(created.providerUserInfo).toEqual([])
      expect(created.disabled).toBe(false)
    })

    /**
     * RED TEST: Should add updatedAt timestamp on creation
     */
    it('should add updatedAt timestamp on user creation', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const beforeCreate = Date.now()
      const userDoc = createTestUserDocument()
      const created = await storage.createUser(userDoc)
      const afterCreate = Date.now()

      expect(created.updatedAt).toBeDefined()
      const updatedAt = new Date(created.updatedAt).getTime()
      expect(updatedAt).toBeGreaterThanOrEqual(beforeCreate)
      expect(updatedAt).toBeLessThanOrEqual(afterCreate)
    })

    /**
     * RED TEST: Should reject duplicate email
     */
    it('should reject user with duplicate email', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const email = `duplicate-${Date.now()}@example.com`
      const user1 = createTestUserDocument({ email })
      const user2 = createTestUserDocument({ email })

      await storage.createUser(user1)

      await expect(storage.createUser(user2)).rejects.toThrow(/EMAIL_EXISTS|duplicate/)
    })

    /**
     * RED TEST: Should reject duplicate localId
     */
    it('should reject user with duplicate localId', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const localId = `duplicate-id-${Date.now()}`
      const user1 = createTestUserDocument({ localId, _id: localId })
      const user2 = createTestUserDocument({
        localId,
        _id: localId,
        email: `different-${Date.now()}@example.com`,
      })

      await storage.createUser(user1)

      await expect(storage.createUser(user2)).rejects.toThrow(/duplicate|already exists/)
    })
  })

  describe('findUserById', () => {
    /**
     * RED TEST: Should find user by localId
     */
    it('should find user by localId', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const userDoc = createTestUserDocument()
      await storage.createUser(userDoc)

      const found = await storage.findUserById(userDoc.localId)

      expect(found).toBeDefined()
      expect(found?.localId).toBe(userDoc.localId)
      expect(found?.email).toBe(userDoc.email)
    })

    /**
     * RED TEST: Should return null for non-existent user
     */
    it('should return null for non-existent localId', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const found = await storage.findUserById('non-existent-id')

      expect(found).toBeNull()
    })

    /**
     * RED TEST: Should return all user fields
     */
    it('should return user with all fields', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const userDoc = createTestUserDocument({
        displayName: 'Full User',
        photoUrl: 'https://example.com/full.jpg',
        emailVerified: true,
        providerUserInfo: [
          { providerId: 'password', email: 'test@example.com' },
        ],
      })
      await storage.createUser(userDoc)

      const found = await storage.findUserById(userDoc.localId)

      expect(found).toBeDefined()
      expect(found?.displayName).toBe('Full User')
      expect(found?.photoUrl).toBe('https://example.com/full.jpg')
      expect(found?.emailVerified).toBe(true)
      expect(found?.providerUserInfo).toHaveLength(1)
      expect(found?.providerUserInfo[0].providerId).toBe('password')
    })
  })

  describe('findUserByEmail', () => {
    /**
     * RED TEST: Should find user by email
     */
    it('should find user by email', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const userDoc = createTestUserDocument()
      await storage.createUser(userDoc)

      const found = await storage.findUserByEmail(userDoc.email!)

      expect(found).toBeDefined()
      expect(found?.email).toBe(userDoc.email)
      expect(found?.localId).toBe(userDoc.localId)
    })

    /**
     * RED TEST: Should find user by email case-insensitively
     */
    it('should find user by email case-insensitively', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const email = `TestEmail-${Date.now()}@Example.COM`
      const userDoc = createTestUserDocument({ email })
      await storage.createUser(userDoc)

      // Search with different case
      const found = await storage.findUserByEmail(email.toLowerCase())

      expect(found).toBeDefined()
      expect(found?.email).toBe(email)
    })

    /**
     * RED TEST: Should return null for non-existent email
     */
    it('should return null for non-existent email', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const found = await storage.findUserByEmail('nonexistent@example.com')

      expect(found).toBeNull()
    })
  })

  describe('updateUser', () => {
    /**
     * RED TEST: Should update user displayName
     */
    it('should update user displayName', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const userDoc = createTestUserDocument()
      await storage.createUser(userDoc)

      const updated = await storage.updateUser(userDoc.localId, {
        displayName: 'Updated Name',
      })

      expect(updated).toBeDefined()
      expect(updated?.displayName).toBe('Updated Name')

      // Verify persistence
      const found = await storage.findUserById(userDoc.localId)
      expect(found?.displayName).toBe('Updated Name')
    })

    /**
     * RED TEST: Should update user email
     */
    it('should update user email', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const userDoc = createTestUserDocument()
      await storage.createUser(userDoc)

      const newEmail = `updated-${Date.now()}@example.com`
      const updated = await storage.updateUser(userDoc.localId, {
        email: newEmail,
      })

      expect(updated).toBeDefined()
      expect(updated?.email).toBe(newEmail)

      // Should be findable by new email
      const foundByNew = await storage.findUserByEmail(newEmail)
      expect(foundByNew?.localId).toBe(userDoc.localId)

      // Should NOT be findable by old email
      const foundByOld = await storage.findUserByEmail(userDoc.email!)
      expect(foundByOld).toBeNull()
    })

    /**
     * RED TEST: Should update user password hash
     */
    it('should update user password hash and salt', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const userDoc = createTestUserDocument()
      await storage.createUser(userDoc)

      const newHash = 'new-password-hash'
      const newSalt = 'new-password-salt'
      const updated = await storage.updateUser(userDoc.localId, {
        passwordHash: newHash,
        passwordSalt: newSalt,
        passwordUpdatedAt: Date.now(),
      })

      expect(updated).toBeDefined()
      expect(updated?.passwordHash).toBe(newHash)
      expect(updated?.passwordSalt).toBe(newSalt)
    })

    /**
     * RED TEST: Should update multiple fields atomically
     */
    it('should update multiple fields atomically', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const userDoc = createTestUserDocument()
      await storage.createUser(userDoc)

      const updated = await storage.updateUser(userDoc.localId, {
        displayName: 'Multi Update',
        photoUrl: 'https://example.com/new.jpg',
        emailVerified: true,
      })

      expect(updated?.displayName).toBe('Multi Update')
      expect(updated?.photoUrl).toBe('https://example.com/new.jpg')
      expect(updated?.emailVerified).toBe(true)
    })

    /**
     * RED TEST: Should update updatedAt timestamp on update
     */
    it('should update updatedAt timestamp on user update', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const userDoc = createTestUserDocument()
      const created = await storage.createUser(userDoc)
      const originalUpdatedAt = created.updatedAt

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10))

      const updated = await storage.updateUser(userDoc.localId, {
        displayName: 'Timestamp Test',
      })

      expect(updated?.updatedAt).toBeDefined()
      expect(new Date(updated!.updatedAt!).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      )
    })

    /**
     * RED TEST: Should return null when updating non-existent user
     */
    it('should return null when updating non-existent user', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const updated = await storage.updateUser('non-existent-id', {
        displayName: 'Ghost',
      })

      expect(updated).toBeNull()
    })

    /**
     * RED TEST: Should reject update to duplicate email
     */
    it('should reject update to email that already exists', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const user1 = createTestUserDocument()
      const user2 = createTestUserDocument()
      await storage.createUser(user1)
      await storage.createUser(user2)

      // Try to update user2's email to user1's email
      await expect(
        storage.updateUser(user2.localId, { email: user1.email })
      ).rejects.toThrow(/EMAIL_EXISTS|duplicate/)
    })

    /**
     * RED TEST: Should allow clearing optional fields
     */
    it('should allow clearing optional fields with null', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const userDoc = createTestUserDocument({
        displayName: 'Will Be Cleared',
        photoUrl: 'https://example.com/clear.jpg',
      })
      await storage.createUser(userDoc)

      const updated = await storage.updateUser(userDoc.localId, {
        displayName: undefined, // Clear field
        photoUrl: undefined, // Clear field
      })

      expect(updated?.displayName).toBeUndefined()
      expect(updated?.photoUrl).toBeUndefined()
    })
  })

  describe('deleteUser', () => {
    /**
     * RED TEST: Should delete user from MongoDB
     */
    it('should delete user and return true', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const userDoc = createTestUserDocument()
      await storage.createUser(userDoc)

      const deleted = await storage.deleteUser(userDoc.localId)

      expect(deleted).toBe(true)

      // Verify user is gone
      const found = await storage.findUserById(userDoc.localId)
      expect(found).toBeNull()
    })

    /**
     * RED TEST: Should return false for non-existent user
     */
    it('should return false when deleting non-existent user', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const deleted = await storage.deleteUser('non-existent-id')

      expect(deleted).toBe(false)
    })

    /**
     * RED TEST: Should remove email index on delete
     */
    it('should remove email from index when user is deleted', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      const userDoc = createTestUserDocument()
      await storage.createUser(userDoc)

      await storage.deleteUser(userDoc.localId)

      // Email should no longer be indexed
      const foundByEmail = await storage.findUserByEmail(userDoc.email!)
      expect(foundByEmail).toBeNull()
    })
  })

  describe('countUsers', () => {
    /**
     * RED TEST: Should count users in MongoDB
     */
    it('should return correct user count', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      // Clear all users first
      await storage.clearAllUsers()

      const initialCount = await storage.countUsers()
      expect(initialCount).toBe(0)

      // Create some users
      await storage.createUser(createTestUserDocument())
      await storage.createUser(createTestUserDocument())
      await storage.createUser(createTestUserDocument())

      const finalCount = await storage.countUsers()
      expect(finalCount).toBe(3)
    })
  })

  describe('clearAllUsers', () => {
    /**
     * RED TEST: Should clear all users from MongoDB
     */
    it('should remove all users', async () => {
      const mongoModule = await import('../../src/storage/mongo.js')
      const storage = (mongoModule as any).createMongoUserStorage()

      // Create some users
      await storage.createUser(createTestUserDocument())
      await storage.createUser(createTestUserDocument())

      const countBefore = await storage.countUsers()
      expect(countBefore).toBeGreaterThan(0)

      await storage.clearAllUsers()

      const countAfter = await storage.countUsers()
      expect(countAfter).toBe(0)
    })
  })
})

// ============================================================================
// Integration with Identity Toolkit Tests
// ============================================================================

describe('Identity Toolkit MongoDB Integration', () => {
  /**
   * RED TEST: Identity toolkit should use MongoDB storage
   *
   * This tests that the identity-toolkit module is wired up to use
   * MongoDB persistence instead of in-memory storage.
   */
  it('should use MongoDB for user persistence in handleSignUp', async () => {
    const mongoModule = await import('../../src/storage/mongo.js')
    const storage = (mongoModule as any).createMongoUserStorage()

    // Clear users first
    await storage.clearAllUsers()

    // Sign up should create user in MongoDB
    const { handleSignUp } = await import('../../src/auth/identity-toolkit.js')
    const result = await handleSignUp({
      email: `mongodb-test-${Date.now()}@example.com`,
      password: 'testPassword123!',
      returnSecureToken: true,
    })

    // Verify no error
    expect('error' in result).toBe(false)
    const signUpResult = result as { localId: string; email: string }

    // User should exist in MongoDB
    const found = await storage.findUserById(signUpResult.localId)
    expect(found).toBeDefined()
    expect(found?.email).toBe(signUpResult.email)
  })

  /**
   * RED TEST: User data should persist across module reloads
   *
   * This simulates a server restart scenario where in-memory data would be lost.
   */
  it('should persist user data across simulated restarts', async () => {
    const mongoModule = await import('../../src/storage/mongo.js')
    const storage = (mongoModule as any).createMongoUserStorage()

    const email = `persist-test-${Date.now()}@example.com`
    const userDoc = {
      _id: `persist-test-${Date.now()}`,
      localId: `persist-test-${Date.now()}`,
      email,
      emailVerified: false,
      passwordHash: 'test-hash',
      passwordSalt: 'test-salt',
      providerUserInfo: [],
      disabled: false,
      createdAt: Date.now().toString(),
    } as MongoUserDocument

    await storage.createUser(userDoc)

    // Create a new storage instance (simulates restart)
    const newStorage = (mongoModule as any).createMongoUserStorage()

    // User should still exist
    const found = await newStorage.findUserByEmail(email)
    expect(found).toBeDefined()
    expect(found?.localId).toBe(userDoc.localId)
  })

  /**
   * RED TEST: Deleted users should be removed from MongoDB
   */
  it('should persist user deletion to MongoDB', async () => {
    const mongoModule = await import('../../src/storage/mongo.js')
    const storage = (mongoModule as any).createMongoUserStorage()

    const userDoc = {
      _id: `delete-persist-${Date.now()}`,
      localId: `delete-persist-${Date.now()}`,
      email: `delete-persist-${Date.now()}@example.com`,
      emailVerified: false,
      passwordHash: 'test-hash',
      passwordSalt: 'test-salt',
      providerUserInfo: [],
      disabled: false,
      createdAt: Date.now().toString(),
    } as MongoUserDocument

    await storage.createUser(userDoc)
    await storage.deleteUser(userDoc.localId)

    // User should not exist in MongoDB
    const found = await storage.findUserById(userDoc.localId)
    expect(found).toBeNull()

    // Even with a new storage instance
    const newStorage = (mongoModule as any).createMongoUserStorage()
    const foundAgain = await newStorage.findUserById(userDoc.localId)
    expect(foundAgain).toBeNull()
  })
})

// ============================================================================
// MongoDB Collection Configuration Tests
// ============================================================================

describe('MongoDB User Collection Configuration', () => {
  /**
   * RED TEST: Should use correct collection name
   */
  it('should use "users" as the default collection name', async () => {
    const mongoModule = await import('../../src/storage/mongo.js')

    // The module should export the collection name constant
    expect(mongoModule).toHaveProperty('USERS_COLLECTION_NAME')
    expect((mongoModule as any).USERS_COLLECTION_NAME).toBe('users')
  })

  /**
   * RED TEST: Should support custom collection name
   */
  it('should allow custom collection name via configuration', async () => {
    const mongoModule = await import('../../src/storage/mongo.js')

    // Should be able to create storage with custom collection
    const storage = (mongoModule as any).createMongoUserStorage({
      collectionName: 'custom_users',
    })

    expect(storage).toBeDefined()
  })

  /**
   * RED TEST: Should create indexes for email lookups
   */
  it('should have email index for efficient lookups', async () => {
    const mongoModule = await import('../../src/storage/mongo.js')
    const storage = (mongoModule as any).createMongoUserStorage()

    // Storage should report that email index exists
    const indexes = await storage.getIndexes?.()

    expect(indexes).toBeDefined()
    const emailIndex = indexes.find((idx: any) => idx.key?.email !== undefined)
    expect(emailIndex).toBeDefined()
    expect(emailIndex?.unique).toBe(true)
  })
})

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('MongoDB User Storage Error Handling', () => {
  /**
   * RED TEST: Should handle connection errors gracefully
   */
  it('should throw meaningful error on connection failure', async () => {
    const mongoModule = await import('../../src/storage/mongo.js')

    // Create storage with invalid connection string
    const storage = (mongoModule as any).createMongoUserStorage({
      connectionString: 'mongodb://invalid:27017/nonexistent',
    })

    await expect(
      storage.findUserById('test')
    ).rejects.toThrow(/connection|ECONNREFUSED|ENOTFOUND/)
  })

  /**
   * RED TEST: Should validate user document before saving
   */
  it('should reject invalid user documents', async () => {
    const mongoModule = await import('../../src/storage/mongo.js')
    const storage = (mongoModule as any).createMongoUserStorage()

    // Missing required localId
    await expect(
      storage.createUser({ email: 'test@example.com' })
    ).rejects.toThrow(/localId|required/)
  })

  /**
   * RED TEST: Should handle concurrent updates safely
   */
  it('should handle concurrent updates with optimistic locking', async () => {
    const mongoModule = await import('../../src/storage/mongo.js')
    const storage = (mongoModule as any).createMongoUserStorage()

    const userDoc = {
      _id: `concurrent-${Date.now()}`,
      localId: `concurrent-${Date.now()}`,
      email: `concurrent-${Date.now()}@example.com`,
      emailVerified: false,
      passwordHash: 'test-hash',
      passwordSalt: 'test-salt',
      providerUserInfo: [],
      disabled: false,
      createdAt: Date.now().toString(),
    } as MongoUserDocument

    await storage.createUser(userDoc)

    // Simulate concurrent updates
    const update1 = storage.updateUser(userDoc.localId, { displayName: 'Update 1' })
    const update2 = storage.updateUser(userDoc.localId, { displayName: 'Update 2' })

    // Both should complete without error (last write wins or conflict resolution)
    const [result1, result2] = await Promise.all([update1, update2])

    expect(result1).toBeDefined()
    expect(result2).toBeDefined()

    // Final value should be one of the updates
    const final = await storage.findUserById(userDoc.localId)
    expect(['Update 1', 'Update 2']).toContain(final?.displayName)
  })
})
