/**
 * E2E Tests: Complete Auth Flow with Firebase SDK
 *
 * Issue: firebase-244
 *
 * This test verifies the complete authentication flow works with the Firebase SDK,
 * including:
 * 1. User registration (sign up)
 * 2. Sign out
 * 3. Sign in with email/password
 * 4. Token refresh
 * 5. Profile update
 * 6. Password change
 * 7. Account deletion
 *
 * The test uses the official Firebase SDK pointed at the local auth emulator
 * to validate that the firebase.do backend is fully compatible.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { initializeApp, deleteApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  updatePassword,
  deleteUser,
  onAuthStateChanged,
  type Auth,
  type User,
  type UserCredential,
} from 'firebase/auth'

// Configuration for local emulator
const FIREBASE_CONFIG = {
  projectId: 'test-project',
  apiKey: 'test-api-key-for-e2e-testing',
  authDomain: 'test-project.firebase.do',
}

const LOCAL_HOST = process.env.FIREBASE_DO_HOST || 'localhost'
const AUTH_PORT = parseInt(process.env.FIREBASE_DO_AUTH_PORT || '9099')

describe('E2E: Complete Auth Flow with Firebase SDK', () => {
  let app: FirebaseApp
  let auth: Auth

  beforeAll(() => {
    app = initializeApp(FIREBASE_CONFIG, 'complete-auth-flow-test')
    auth = getAuth(app)
    connectAuthEmulator(auth, `http://${LOCAL_HOST}:${AUTH_PORT}`, {
      disableWarnings: true,
    })
  })

  afterAll(async () => {
    const apps = getApps()
    for (const existingApp of apps) {
      await deleteApp(existingApp)
    }
  })

  // Helper to generate unique test emails
  function generateTestEmail(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`
  }

  // Helper to wait for auth state to stabilize
  function waitForAuthState(auth: Auth, expectedUser: User | null, timeout = 5000): Promise<User | null> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unsubscribe()
        reject(new Error('Auth state did not change within timeout'))
      }, timeout)

      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if ((expectedUser === null && user === null) || (expectedUser !== null && user !== null)) {
          clearTimeout(timeoutId)
          unsubscribe()
          resolve(user)
        }
      })
    })
  }

  describe('Complete Authentication Lifecycle', () => {
    /**
     * This test exercises the complete auth flow from start to finish:
     * 1. Create a new user account
     * 2. Verify user is signed in
     * 3. Sign out
     * 4. Sign back in
     * 5. Update profile
     * 6. Change password
     * 7. Delete account
     */
    it('should complete full auth lifecycle: signup -> signout -> signin -> update -> delete', async () => {
      const email = generateTestEmail()
      const password = 'SecurePassword123!'
      const newPassword = 'NewSecurePassword456!'
      const displayName = 'Test User'
      const photoURL = 'https://example.com/photo.jpg'

      // Step 1: Create a new user account
      const signUpCredential = await createUserWithEmailAndPassword(auth, email, password)

      expect(signUpCredential).toBeDefined()
      expect(signUpCredential.user).toBeDefined()
      expect(signUpCredential.user.email).toBe(email)
      expect(signUpCredential.user.uid).toBeDefined()
      expect(signUpCredential.user.uid.length).toBeGreaterThan(0)

      const uid = signUpCredential.user.uid

      // Verify ID token is available
      const idToken = await signUpCredential.user.getIdToken()
      expect(idToken).toBeDefined()
      expect(typeof idToken).toBe('string')
      expect(idToken.length).toBeGreaterThan(0)

      // Step 2: Verify user is currently signed in
      expect(auth.currentUser).toBeDefined()
      expect(auth.currentUser?.uid).toBe(uid)
      expect(auth.currentUser?.email).toBe(email)

      // Step 3: Sign out
      await signOut(auth)

      // Verify user is signed out
      expect(auth.currentUser).toBeNull()

      // Step 4: Sign back in with email/password
      const signInCredential = await signInWithEmailAndPassword(auth, email, password)

      expect(signInCredential).toBeDefined()
      expect(signInCredential.user).toBeDefined()
      expect(signInCredential.user.uid).toBe(uid) // Same user ID
      expect(signInCredential.user.email).toBe(email)

      // Verify user is signed in again
      expect(auth.currentUser).toBeDefined()
      expect(auth.currentUser?.uid).toBe(uid)

      // Step 5: Update profile (displayName and photoURL)
      await updateProfile(signInCredential.user, {
        displayName,
        photoURL,
      })

      // Force reload to get fresh data
      await signInCredential.user.reload()

      expect(signInCredential.user.displayName).toBe(displayName)
      expect(signInCredential.user.photoURL).toBe(photoURL)

      // Step 6: Change password
      await updatePassword(signInCredential.user, newPassword)

      // Sign out and sign in with new password to verify it was changed
      await signOut(auth)

      const newPasswordSignIn = await signInWithEmailAndPassword(auth, email, newPassword)
      expect(newPasswordSignIn.user.uid).toBe(uid)

      // Step 7: Delete the account
      await deleteUser(newPasswordSignIn.user)

      // Verify user is signed out after deletion
      expect(auth.currentUser).toBeNull()

      // Verify the account no longer exists by trying to sign in
      await expect(signInWithEmailAndPassword(auth, email, newPassword)).rejects.toThrow()
    })

    it('should handle token refresh during extended session', async () => {
      const email = generateTestEmail()
      const password = 'SecurePassword123!'

      // Create user
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      const user = credential.user

      // Get initial token
      const initialToken = await user.getIdToken()
      expect(initialToken).toBeDefined()

      // Force token refresh
      const refreshedToken = await user.getIdToken(true) // force refresh
      expect(refreshedToken).toBeDefined()
      expect(typeof refreshedToken).toBe('string')

      // Both tokens should be valid JWTs (3 parts separated by dots)
      expect(initialToken.split('.').length).toBe(3)
      expect(refreshedToken.split('.').length).toBe(3)

      // Clean up
      await deleteUser(user)
    })

    it('should maintain auth state across multiple operations', async () => {
      const email = generateTestEmail()
      const password = 'SecurePassword123!'

      // Create user
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      const uid = credential.user.uid

      // Perform multiple profile updates
      await updateProfile(credential.user, { displayName: 'Name 1' })
      expect(auth.currentUser?.uid).toBe(uid)

      await updateProfile(credential.user, { displayName: 'Name 2' })
      expect(auth.currentUser?.uid).toBe(uid)

      await updateProfile(credential.user, { displayName: 'Name 3' })
      expect(auth.currentUser?.uid).toBe(uid)

      // Reload and verify final state
      await credential.user.reload()
      expect(credential.user.displayName).toBe('Name 3')

      // Auth state should still be valid
      expect(auth.currentUser).toBeDefined()
      expect(auth.currentUser?.uid).toBe(uid)

      // Clean up
      await deleteUser(credential.user)
    })

    it('should handle concurrent auth operations correctly', async () => {
      const email = generateTestEmail()
      const password = 'SecurePassword123!'

      // Create user
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      const user = credential.user

      // Perform multiple concurrent token refreshes
      const [token1, token2, token3] = await Promise.all([
        user.getIdToken(),
        user.getIdToken(),
        user.getIdToken(),
      ])

      // All should return valid tokens
      expect(token1).toBeDefined()
      expect(token2).toBeDefined()
      expect(token3).toBeDefined()

      // Clean up
      await deleteUser(user)
    })
  })

  describe('Error Handling in Auth Flow', () => {
    it('should reject sign in with wrong password', async () => {
      const email = generateTestEmail()
      const password = 'SecurePassword123!'

      // Create user
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      await signOut(auth)

      // Try to sign in with wrong password
      await expect(
        signInWithEmailAndPassword(auth, email, 'WrongPassword123!')
      ).rejects.toThrow()

      // Clean up - sign in with correct password and delete
      const cleanupCredential = await signInWithEmailAndPassword(auth, email, password)
      await deleteUser(cleanupCredential.user)
    })

    it('should reject sign in with non-existent email', async () => {
      const nonExistentEmail = `nonexistent-${Date.now()}@example.com`

      await expect(
        signInWithEmailAndPassword(auth, nonExistentEmail, 'AnyPassword123!')
      ).rejects.toThrow()
    })

    it('should reject duplicate email registration', async () => {
      const email = generateTestEmail()
      const password = 'SecurePassword123!'

      // Create first user
      const credential = await createUserWithEmailAndPassword(auth, email, password)

      // Sign out first user
      await signOut(auth)

      // Try to create another user with same email
      await expect(
        createUserWithEmailAndPassword(auth, email, password)
      ).rejects.toThrow()

      // Clean up
      const cleanupCredential = await signInWithEmailAndPassword(auth, email, password)
      await deleteUser(cleanupCredential.user)
    })

    it('should reject weak passwords during registration', async () => {
      const email = generateTestEmail()
      const weakPassword = '123' // Too short

      await expect(
        createUserWithEmailAndPassword(auth, email, weakPassword)
      ).rejects.toThrow()
    })

    it('should reject invalid email format during registration', async () => {
      const invalidEmail = 'not-an-email'
      const password = 'SecurePassword123!'

      await expect(
        createUserWithEmailAndPassword(auth, invalidEmail, password)
      ).rejects.toThrow()
    })
  })

  describe('Auth State Observers', () => {
    it('should notify auth state changes on sign in and sign out', async () => {
      const email = generateTestEmail()
      const password = 'SecurePassword123!'
      const authStateChanges: (User | null)[] = []

      // Set up auth state observer
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        authStateChanges.push(user)
      })

      try {
        // Create user - should trigger auth state change
        const credential = await createUserWithEmailAndPassword(auth, email, password)

        // Wait a bit for the auth state to propagate
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Sign out - should trigger another auth state change
        await signOut(auth)

        // Wait a bit for the auth state to propagate
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Should have received at least 2 state changes (signed in, signed out)
        // Note: There might be an initial null state too
        expect(authStateChanges.length).toBeGreaterThanOrEqual(2)

        // The last state should be null (signed out)
        expect(authStateChanges[authStateChanges.length - 1]).toBeNull()

        // There should be a non-null user state before the final null
        const signedInState = authStateChanges.find((user) => user !== null)
        expect(signedInState).toBeDefined()
        expect(signedInState?.email).toBe(email)

        // Clean up - sign in and delete user
        const cleanupCredential = await signInWithEmailAndPassword(auth, email, password)
        await deleteUser(cleanupCredential.user)
      } finally {
        unsubscribe()
      }
    })

    it('should allow multiple auth state observers', async () => {
      const email = generateTestEmail()
      const password = 'SecurePassword123!'
      let observer1Called = false
      let observer2Called = false

      const unsubscribe1 = onAuthStateChanged(auth, () => {
        observer1Called = true
      })

      const unsubscribe2 = onAuthStateChanged(auth, () => {
        observer2Called = true
      })

      try {
        // Create user to trigger auth state change
        const credential = await createUserWithEmailAndPassword(auth, email, password)

        // Wait for observers to be called
        await new Promise((resolve) => setTimeout(resolve, 100))

        expect(observer1Called).toBe(true)
        expect(observer2Called).toBe(true)

        // Clean up
        await deleteUser(credential.user)
      } finally {
        unsubscribe1()
        unsubscribe2()
      }
    })
  })

  describe('Token Operations', () => {
    it('should provide valid JWT token structure', async () => {
      const email = generateTestEmail()
      const password = 'SecurePassword123!'

      const credential = await createUserWithEmailAndPassword(auth, email, password)
      const idToken = await credential.user.getIdToken()

      // JWT should have 3 parts: header, payload, signature
      const parts = idToken.split('.')
      expect(parts.length).toBe(3)

      // Decode and verify header
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
      expect(header).toHaveProperty('alg')
      expect(header).toHaveProperty('typ', 'JWT')

      // Decode and verify payload contains expected claims
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      expect(payload).toHaveProperty('iss') // Issuer
      expect(payload).toHaveProperty('aud') // Audience
      expect(payload).toHaveProperty('sub') // Subject (user ID)
      expect(payload).toHaveProperty('iat') // Issued at
      expect(payload).toHaveProperty('exp') // Expiration
      expect(payload).toHaveProperty('user_id')
      expect(payload.user_id).toBe(credential.user.uid)
      expect(payload).toHaveProperty('email', email)

      // Clean up
      await deleteUser(credential.user)
    })

    it('should refresh token and get new valid token', async () => {
      const email = generateTestEmail()
      const password = 'SecurePassword123!'

      const credential = await createUserWithEmailAndPassword(auth, email, password)

      // Get initial token
      const token1 = await credential.user.getIdToken()

      // Force refresh to get new token
      const token2 = await credential.user.getIdToken(true)

      // Both should be valid JWTs
      expect(token1.split('.').length).toBe(3)
      expect(token2.split('.').length).toBe(3)

      // Decode both and verify they have the same user_id
      const payload1 = JSON.parse(Buffer.from(token1.split('.')[1], 'base64url').toString())
      const payload2 = JSON.parse(Buffer.from(token2.split('.')[1], 'base64url').toString())

      expect(payload1.user_id).toBe(payload2.user_id)
      expect(payload1.user_id).toBe(credential.user.uid)

      // Clean up
      await deleteUser(credential.user)
    })
  })
})
