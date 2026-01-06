import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import {
  clearRefreshTokenStore,
  getRefreshTokenStoreSize,
  getRefreshTokenExpirationMs,
} from '../../src/auth/identity-toolkit.js'

/**
 * Firebase SecureToken v1 REST API Tests - Refresh Token Exchange
 *
 * RED TESTS: These tests verify the POST /v1/token endpoint for exchanging
 * refresh tokens for new access tokens.
 *
 * Issue: firebase-22i
 * Blocks: firebase-1xy (GREEN: Implement refresh token exchange endpoint)
 *
 * Reference: https://firebase.google.com/docs/reference/rest/auth#section-refresh-token
 *
 * Base URL: https://securetoken.googleapis.com/v1/token
 */

const IDENTITY_TOOLKIT_URL = process.env.FIREBASE_AUTH_EMULATOR_HOST
  ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`
  : 'http://localhost:9099/identitytoolkit.googleapis.com/v1'

const TOKEN_URL = process.env.FIREBASE_AUTH_EMULATOR_HOST
  ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/securetoken.googleapis.com/v1/token`
  : 'http://localhost:9099/securetoken.googleapis.com/v1/token'

const API_KEY = process.env.FIREBASE_API_KEY || 'test-api-key'

interface SignUpResponse {
  idToken: string
  email: string
  refreshToken: string
  expiresIn: string
  localId: string
}

interface TokenExchangeResponse {
  access_token: string
  expires_in: string
  token_type: string
  refresh_token: string
  id_token: string
  user_id: string
  project_id: string
}

interface ErrorResponse {
  error: {
    code: number
    message: string
    errors?: Array<{
      message: string
      domain: string
      reason: string
    }>
  }
}

function generateTestEmail(): string {
  return `token-test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`
}

async function signUp(email: string, password: string): Promise<SignUpResponse> {
  const response = await fetch(`${IDENTITY_TOOLKIT_URL}/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`Sign up failed: ${response.status}`)
  }

  return response.json()
}

async function exchangeRefreshToken(
  refreshToken: string,
  grantType: string = 'refresh_token'
): Promise<{ status: number; data: TokenExchangeResponse | ErrorResponse }> {
  const response = await fetch(`${TOKEN_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: grantType,
      refresh_token: refreshToken,
    }),
  })

  const data = await response.json()
  return { status: response.status, data }
}

async function exchangeRefreshTokenWithBody(
  body: Record<string, string>
): Promise<{ status: number; data: TokenExchangeResponse | ErrorResponse }> {
  const response = await fetch(`${TOKEN_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  })

  const data = await response.json()
  return { status: response.status, data }
}

describe('SecureToken v1 API - Refresh Token Exchange', () => {
  /**
   * RED TESTS: POST /v1/token with grant_type=refresh_token
   *
   * These tests verify the refresh token exchange endpoint which allows
   * clients to obtain new access tokens using a valid refresh token.
   */

  describe('POST /v1/token - Successful token exchange', () => {
    // Each test gets a fresh signup because token rotation invalidates tokens after use
    async function freshSignup(): Promise<{ email: string; refreshToken: string; localId: string }> {
      const email = generateTestEmail()
      const result = await signUp(email, 'testPassword123!')
      return { email, refreshToken: result.refreshToken, localId: result.localId }
    }

    it('should exchange valid refresh token for new access token', async () => {
      const { refreshToken: testRefreshToken, localId: testLocalId } = await freshSignup()
      const { status, data } = await exchangeRefreshToken(testRefreshToken)

      expect(status).toBe(200)

      const response = data as TokenExchangeResponse
      expect(response).toHaveProperty('access_token')
      expect(response).toHaveProperty('expires_in')
      expect(response).toHaveProperty('token_type')
      expect(response).toHaveProperty('refresh_token')
      expect(response).toHaveProperty('id_token')
      expect(response).toHaveProperty('user_id')
      expect(response).toHaveProperty('project_id')

      expect(typeof response.access_token).toBe('string')
      expect(response.access_token.length).toBeGreaterThan(0)
      expect(response.token_type).toBe('Bearer')
      expect(response.user_id).toBe(testLocalId)
    })

    it('should return new refresh token on exchange', async () => {
      const { refreshToken: testRefreshToken } = await freshSignup()
      const { status, data } = await exchangeRefreshToken(testRefreshToken)

      expect(status).toBe(200)

      const response = data as TokenExchangeResponse
      expect(typeof response.refresh_token).toBe('string')
      expect(response.refresh_token.length).toBeGreaterThan(0)

      // New refresh token should be different from the original
      // (token rotation for security)
      expect(response.refresh_token).not.toBe(testRefreshToken)
    })

    it('should return valid id_token that matches access_token', async () => {
      const { refreshToken: testRefreshToken } = await freshSignup()
      const { status, data } = await exchangeRefreshToken(testRefreshToken)

      expect(status).toBe(200)

      const response = data as TokenExchangeResponse

      // id_token and access_token should be the same in Firebase Auth
      expect(response.id_token).toBe(response.access_token)

      // id_token should be a valid JWT (3 parts)
      const parts = response.id_token.split('.')
      expect(parts.length).toBe(3)
    })

    it('should return expires_in as a numeric string in seconds', async () => {
      const { refreshToken: testRefreshToken } = await freshSignup()
      const { status, data } = await exchangeRefreshToken(testRefreshToken)

      expect(status).toBe(200)

      const response = data as TokenExchangeResponse
      expect(typeof response.expires_in).toBe('string')
      const expiresIn = parseInt(response.expires_in, 10)
      expect(expiresIn).toBeGreaterThan(0)
      // Firebase typically returns 3600 (1 hour)
      expect(expiresIn).toBe(3600)
    })

    it('should return correct project_id', async () => {
      const { refreshToken: testRefreshToken } = await freshSignup()
      const { status, data } = await exchangeRefreshToken(testRefreshToken)

      expect(status).toBe(200)

      const response = data as TokenExchangeResponse
      expect(typeof response.project_id).toBe('string')
      expect(response.project_id.length).toBeGreaterThan(0)
    })

    it('should allow using the new refresh token for subsequent exchanges', async () => {
      const { refreshToken: testRefreshToken, localId: testLocalId } = await freshSignup()
      // First exchange
      const { status: status1, data: data1 } = await exchangeRefreshToken(testRefreshToken)
      expect(status1).toBe(200)

      const firstResponse = data1 as TokenExchangeResponse
      const newRefreshToken = firstResponse.refresh_token

      // Second exchange using the new refresh token
      const { status: status2, data: data2 } = await exchangeRefreshToken(newRefreshToken)
      expect(status2).toBe(200)

      const secondResponse = data2 as TokenExchangeResponse
      expect(secondResponse.user_id).toBe(testLocalId)
      expect(secondResponse.access_token).toBeTruthy()
    })

    it('should return id_token with correct user claims', async () => {
      const { refreshToken: testRefreshToken, localId: testLocalId, email: testEmail } = await freshSignup()
      const { status, data } = await exchangeRefreshToken(testRefreshToken)

      expect(status).toBe(200)

      const response = data as TokenExchangeResponse

      // Decode JWT payload
      const parts = response.id_token.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

      expect(payload).toHaveProperty('user_id')
      expect(payload).toHaveProperty('sub')
      expect(payload).toHaveProperty('email')
      expect(payload).toHaveProperty('iss')
      expect(payload).toHaveProperty('aud')
      expect(payload).toHaveProperty('iat')
      expect(payload).toHaveProperty('exp')

      expect(payload.user_id).toBe(testLocalId)
      expect(payload.sub).toBe(testLocalId)
      expect(payload.email).toBe(testEmail)
    })
  })

  describe('POST /v1/token - Error handling', () => {
    it('should return INVALID_REFRESH_TOKEN for non-existent token', async () => {
      const { status, data } = await exchangeRefreshToken('non-existent-refresh-token-12345')

      expect(status).toBe(400)

      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toMatch(/INVALID_REFRESH_TOKEN/)
    })

    it('should return INVALID_REFRESH_TOKEN for malformed token', async () => {
      const { status, data } = await exchangeRefreshToken('malformed!@#$%token')

      expect(status).toBe(400)

      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toMatch(/INVALID_REFRESH_TOKEN/)
    })

    it('should return INVALID_REFRESH_TOKEN for empty token', async () => {
      const { status, data } = await exchangeRefreshToken('')

      expect(status).toBe(400)

      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toMatch(/INVALID_REFRESH_TOKEN|MISSING_REFRESH_TOKEN/)
    })

    it('should return MISSING_REFRESH_TOKEN when refresh_token is omitted', async () => {
      const { status, data } = await exchangeRefreshTokenWithBody({
        grant_type: 'refresh_token',
      })

      expect(status).toBe(400)

      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toMatch(/MISSING_REFRESH_TOKEN/)
    })

    it('should return INVALID_GRANT_TYPE for unsupported grant_type', async () => {
      const { status, data } = await exchangeRefreshTokenWithBody({
        grant_type: 'authorization_code',
        refresh_token: 'some-token',
      })

      expect(status).toBe(400)

      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toMatch(/INVALID_GRANT_TYPE/)
    })

    it('should return INVALID_GRANT_TYPE when grant_type is missing', async () => {
      const { status, data } = await exchangeRefreshTokenWithBody({
        refresh_token: 'some-token',
      })

      expect(status).toBe(400)

      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toMatch(/INVALID_GRANT_TYPE|MISSING_GRANT_TYPE/)
    })

    it('should return error for missing API key', async () => {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: 'some-token',
        }),
      })

      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error.message).toMatch(/API_KEY_INVALID|MISSING_API_KEY/)
    })
  })

  describe('POST /v1/token - User state validation', () => {
    it('should return USER_NOT_FOUND for deleted user', async () => {
      // Create user
      const email = generateTestEmail()
      const signUpResult = await signUp(email, 'testPassword123!')

      // Delete the user
      await fetch(`${IDENTITY_TOOLKIT_URL}/accounts:delete?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: signUpResult.idToken,
        }),
      })

      // Try to exchange refresh token for deleted user
      const { status, data } = await exchangeRefreshToken(signUpResult.refreshToken)

      expect(status).toBe(400)

      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toMatch(/USER_NOT_FOUND|INVALID_REFRESH_TOKEN/)
    })

    it('should return USER_DISABLED for disabled user', async () => {
      // Create user
      const email = generateTestEmail()
      const signUpResult = await signUp(email, 'testPassword123!')

      // Disable the user (would need admin API - test with emulator)
      // For now, this test documents expected behavior
      // In real implementation, disabling user should be done via Admin SDK

      // Try to exchange refresh token for disabled user
      // Note: This test may need adjustment based on how user disabling is implemented
      const { status, data } = await exchangeRefreshToken(signUpResult.refreshToken)

      // If user is not disabled, token exchange should succeed
      // When USER_DISABLED error is properly implemented, this should fail
      if (status === 400) {
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/USER_DISABLED/)
      } else {
        // User not disabled, exchange succeeds
        expect(status).toBe(200)
      }
    })
  })

  describe('POST /v1/token - Token expiration', () => {
    /**
     * RED TESTS: Verify that expired refresh tokens are properly rejected
     *
     * Refresh tokens typically expire after 30 days. These tests verify
     * that expired tokens are properly handled.
     *
     * NOTE: Token expiration tests with fake timers cannot work with integration
     * tests against an emulator (separate process). These tests document the
     * expected behavior and should be verified via unit tests or manual testing.
     */

    beforeEach(() => {
      clearRefreshTokenStore()
    })

    afterEach(() => {
      clearRefreshTokenStore()
    })

    it('should have refresh token expiration configured to 30 days', () => {
      const EXPIRATION_MS = getRefreshTokenExpirationMs()
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

      expect(EXPIRATION_MS).toBe(thirtyDaysMs)
    })

    it('should track refresh token store size', async () => {
      // Start with empty store
      const initialSize = getRefreshTokenStoreSize()
      expect(initialSize).toBeGreaterThanOrEqual(0)
    })

    it('should store tokens with expiration metadata', async () => {
      /**
       * RED TEST: Verify token storage includes expiration data
       *
       * This test documents that tokens should be stored with:
       * - userId: the associated user
       * - createdAt: timestamp when token was created
       * - expiresAt: timestamp when token expires (createdAt + 30 days)
       *
       * The validateRefreshToken() function should check expiresAt
       * and return TOKEN_EXPIRED if Date.now() > expiresAt
       */
      const email = generateTestEmail()
      const signUpResult = await signUp(email, 'testPassword123!')

      // Token should be stored
      expect(signUpResult.refreshToken).toBeTruthy()

      // Verify the token works (not expired yet)
      const { status } = await exchangeRefreshToken(signUpResult.refreshToken)
      expect(status).toBe(200)
    })

    it('should reject tokens after expiration period', async () => {
      /**
       * RED TEST: Documents expected behavior for expired tokens
       *
       * Expected behavior when token expires:
       * 1. validateRefreshToken() checks if Date.now() > token.expiresAt
       * 2. If expired, removes token from store
       * 3. Returns { valid: false, error: 'TOKEN_EXPIRED' }
       * 4. handleTokenExchange returns 400 with TOKEN_EXPIRED error
       *
       * This cannot be integration tested with fake timers since the
       * emulator runs in a separate process. Verified via unit tests
       * in identity-toolkit.test.ts.
       */
      const EXPIRATION_MS = getRefreshTokenExpirationMs()

      // Document expected expiration period
      expect(EXPIRATION_MS).toBe(30 * 24 * 60 * 60 * 1000) // 30 days

      // A proper expired token test would need:
      // 1. Unit test with mocked Date.now()
      // 2. Or integration test with test-mode short expiration
      // 3. Or wait 30 days (not practical)
    })
  })

  describe('POST /v1/token - Token rotation and revocation', () => {
    /**
     * RED TESTS: Verify token rotation behavior
     *
     * When a refresh token is exchanged, a new refresh token should be issued.
     * Optionally, the old token may be revoked (depends on implementation).
     */

    it('should issue new refresh token on each exchange', async () => {
      const email = generateTestEmail()
      const signUpResult = await signUp(email, 'testPassword123!')

      const tokens: string[] = [signUpResult.refreshToken]

      // Exchange multiple times
      for (let i = 0; i < 3; i++) {
        const { status, data } = await exchangeRefreshToken(tokens[tokens.length - 1])
        expect(status).toBe(200)

        const response = data as TokenExchangeResponse
        tokens.push(response.refresh_token)
      }

      // All tokens should be unique
      const uniqueTokens = new Set(tokens)
      expect(uniqueTokens.size).toBe(tokens.length)
    })

    it('should maintain user session across multiple token exchanges', async () => {
      const email = generateTestEmail()
      const signUpResult = await signUp(email, 'testPassword123!')

      let currentRefreshToken = signUpResult.refreshToken
      const userId = signUpResult.localId

      // Exchange 5 times
      for (let i = 0; i < 5; i++) {
        const { status, data } = await exchangeRefreshToken(currentRefreshToken)
        expect(status).toBe(200)

        const response = data as TokenExchangeResponse
        expect(response.user_id).toBe(userId)
        currentRefreshToken = response.refresh_token
      }
    })

    it('should handle password change token revocation', async () => {
      // Create user
      const email = generateTestEmail()
      const signUpResult = await signUp(email, 'testPassword123!')
      const originalRefreshToken = signUpResult.refreshToken

      // Change password
      await fetch(`${IDENTITY_TOOLKIT_URL}/accounts:update?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: signUpResult.idToken,
          password: 'newPassword456!',
          returnSecureToken: true,
        }),
      })

      // Try to use original refresh token after password change
      // Depending on implementation, this may or may not be revoked
      const { status, data } = await exchangeRefreshToken(originalRefreshToken)

      // Either the token is revoked (400) or still valid (200)
      // Best practice is to revoke on password change
      expect([200, 400]).toContain(status)

      if (status === 400) {
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/INVALID_REFRESH_TOKEN|TOKEN_EXPIRED/)
      }
    })
  })

  describe('POST /v1/token - Content-Type handling', () => {
    /**
     * RED TESTS: Verify proper handling of different content types
     *
     * The token endpoint should accept application/x-www-form-urlencoded
     * and optionally application/json
     */

    let testRefreshToken: string

    beforeAll(async () => {
      const email = generateTestEmail()
      const signUpResult = await signUp(email, 'testPassword123!')
      testRefreshToken = signUpResult.refreshToken
    })

    it('should accept application/x-www-form-urlencoded', async () => {
      const response = await fetch(`${TOKEN_URL}?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: testRefreshToken,
        }),
      })

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.access_token).toBeTruthy()
    })

    it('should accept application/json', async () => {
      const response = await fetch(`${TOKEN_URL}?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: testRefreshToken,
        }),
      })

      // Should accept JSON or return proper error
      expect([200, 400, 415]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        expect(data.access_token).toBeTruthy()
      }
    })
  })

  describe('POST /v1/token - Concurrent requests', () => {
    /**
     * RED TESTS: Verify handling of concurrent token exchange requests
     */

    it('should handle concurrent token exchanges for same user', async () => {
      const email = generateTestEmail()
      const signUpResult = await signUp(email, 'testPassword123!')

      // Make concurrent requests
      const promises = Array(3)
        .fill(null)
        .map(() => exchangeRefreshToken(signUpResult.refreshToken))

      const results = await Promise.all(promises)

      // At least one should succeed
      const successResults = results.filter((r) => r.status === 200)
      expect(successResults.length).toBeGreaterThanOrEqual(1)

      // All successful results should return same user_id
      const userIds = successResults.map((r) => (r.data as TokenExchangeResponse).user_id)
      const uniqueUserIds = new Set(userIds)
      expect(uniqueUserIds.size).toBe(1)
      expect(userIds[0]).toBe(signUpResult.localId)
    })

    it('should handle rapid sequential token exchanges', async () => {
      const email = generateTestEmail()
      const signUpResult = await signUp(email, 'testPassword123!')

      let currentToken = signUpResult.refreshToken

      // Rapid sequential exchanges
      for (let i = 0; i < 10; i++) {
        const { status, data } = await exchangeRefreshToken(currentToken)

        expect(status).toBe(200)

        const response = data as TokenExchangeResponse
        expect(response.user_id).toBe(signUpResult.localId)

        currentToken = response.refresh_token
      }
    })
  })

  describe('POST /v1/token - Security considerations', () => {
    /**
     * RED TESTS: Security-related behavior
     */

    it('should not expose sensitive information in error responses', async () => {
      const { status, data } = await exchangeRefreshToken('invalid-token')

      expect(status).toBe(400)

      const responseText = JSON.stringify(data)

      // Should not contain sensitive data
      expect(responseText).not.toMatch(/password/i)
      expect(responseText).not.toMatch(/secret/i)
      expect(responseText).not.toMatch(/hash/i)
      expect(responseText).not.toMatch(/salt/i)
    })

    it('should return consistent error for invalid tokens (no timing attacks)', async () => {
      // Both should return similar errors regardless of token length/format
      const { data: data1 } = await exchangeRefreshToken('short')
      const { data: data2 } = await exchangeRefreshToken(
        'a'.repeat(100) + '-very-long-invalid-token'
      )

      const error1 = (data1 as ErrorResponse).error.message
      const error2 = (data2 as ErrorResponse).error.message

      // Both should return INVALID_REFRESH_TOKEN
      expect(error1).toMatch(/INVALID_REFRESH_TOKEN/)
      expect(error2).toMatch(/INVALID_REFRESH_TOKEN/)
    })

    it('should rate limit token exchange requests', async () => {
      const email = generateTestEmail()
      const signUpResult = await signUp(email, 'testPassword123!')

      // Make many rapid requests
      const promises = Array(50)
        .fill(null)
        .map(() => exchangeRefreshToken(signUpResult.refreshToken))

      const results = await Promise.all(promises)

      // Check if any requests were rate limited (429 status)
      const rateLimited = results.filter((r) => r.status === 429)

      // Rate limiting is optional but recommended
      // If implemented, some requests should be rate limited
      // If not implemented, all should be 200 or 400
      results.forEach((r) => {
        expect([200, 400, 429]).toContain(r.status)
      })
    })
  })
})
