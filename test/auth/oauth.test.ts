import { describe, it, expect, beforeEach, afterEach } from 'vitest'

/**
 * WorkOS OAuth Flow Integration Tests
 *
 * RED TESTS: These tests verify OAuth callback handling, token exchange,
 * and user session creation from WorkOS OAuth providers.
 *
 * Issue: firebase-5ux
 * Blocks: firebase-bbk (GREEN: Implement WorkOS OAuth callback handler)
 *
 * OAuth Flow:
 * 1. User initiates OAuth flow by visiting /auth/oauth/authorize endpoint
 * 2. User is redirected to WorkOS authorization URL
 * 3. WorkOS redirects back to /auth/oauth/callback with authorization code
 * 4. Backend exchanges code for tokens via WorkOS API
 * 5. Backend creates/updates user from OAuth profile
 * 6. Backend creates Firebase session tokens
 */

const BASE_URL = process.env.FIREBASE_AUTH_EMULATOR_HOST
  ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`
  : 'http://localhost:9099/identitytoolkit.googleapis.com/v1'

const OAUTH_BASE_URL = process.env.FIREBASE_AUTH_EMULATOR_HOST
  ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/auth.do/oauth`
  : 'http://localhost:9099/auth.do/oauth'

const API_KEY = process.env.FIREBASE_API_KEY || 'test-api-key'

interface OAuthAuthorizeRequest {
  provider: string
  redirect_uri: string
  state?: string
  scope?: string
}

interface OAuthAuthorizeResponse {
  authorization_url: string
  state: string
}

interface OAuthCallbackRequest {
  code: string
  state: string
}

interface OAuthCallbackResponse {
  idToken: string
  refreshToken: string
  expiresIn: string
  localId: string
  email?: string
  emailVerified: boolean
  displayName?: string
  photoUrl?: string
  providerId: string
  federatedId: string
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

interface LookupResponse {
  kind: string
  users: Array<{
    localId: string
    email: string
    emailVerified: boolean
    displayName?: string
    photoUrl?: string
    providerUserInfo: Array<{
      providerId: string
      federatedId?: string
      email?: string
      displayName?: string
      photoUrl?: string
    }>
  }>
}

function generateTestEmail(): string {
  return `oauth-test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`
}

describe('WorkOS OAuth Flow Integration', () => {
  describe('GET /auth.do/oauth/authorize - OAuth initiation', () => {
    /**
     * RED TEST: OAuth authorization endpoint should generate authorization URL
     *
     * This endpoint initiates the OAuth flow by:
     * 1. Validating the provider (google, microsoft, okta, etc.)
     * 2. Generating a secure state parameter for CSRF protection
     * 3. Building the WorkOS authorization URL with proper parameters
     * 4. Returning the URL for client-side redirect
     */
    it('should generate WorkOS authorization URL for Google provider', async () => {
      const request: OAuthAuthorizeRequest = {
        provider: 'google',
        redirect_uri: 'http://localhost:3000/auth/callback',
        scope: 'openid email profile',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/authorize?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(200)
      const data = (await response.json()) as OAuthAuthorizeResponse

      expect(data).toHaveProperty('authorization_url')
      expect(data).toHaveProperty('state')
      expect(data.authorization_url).toMatch(/^https:\/\/api\.workos\.com\/sso\/authorize/)
      expect(data.authorization_url).toContain('provider=google')
      expect(data.authorization_url).toContain('redirect_uri=')
      expect(data.authorization_url).toContain('state=')
      expect(data.state).toBeTruthy()
      expect(data.state.length).toBeGreaterThan(20) // State should be cryptographically secure
    })

    it('should generate WorkOS authorization URL for Microsoft provider', async () => {
      const request: OAuthAuthorizeRequest = {
        provider: 'microsoft',
        redirect_uri: 'http://localhost:3000/auth/callback',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/authorize?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(200)
      const data = (await response.json()) as OAuthAuthorizeResponse

      expect(data.authorization_url).toContain('provider=microsoft')
    })

    it('should generate WorkOS authorization URL for Okta provider', async () => {
      const request: OAuthAuthorizeRequest = {
        provider: 'okta',
        redirect_uri: 'http://localhost:3000/auth/callback',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/authorize?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(200)
      const data = (await response.json()) as OAuthAuthorizeResponse

      expect(data.authorization_url).toContain('provider=okta')
    })

    it('should preserve custom state parameter if provided', async () => {
      const customState = 'my-custom-state-123'
      const request: OAuthAuthorizeRequest = {
        provider: 'google',
        redirect_uri: 'http://localhost:3000/auth/callback',
        state: customState,
      }

      const response = await fetch(`${OAUTH_BASE_URL}/authorize?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(200)
      const data = (await response.json()) as OAuthAuthorizeResponse

      // State should either be the custom state or include it
      expect(data.state).toBeTruthy()
      expect(data.authorization_url).toContain(`state=${encodeURIComponent(data.state)}`)
    })

    it('should return error for unsupported provider', async () => {
      const request: OAuthAuthorizeRequest = {
        provider: 'invalid-provider',
        redirect_uri: 'http://localhost:3000/auth/callback',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/authorize?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(400)
      const data = (await response.json()) as ErrorResponse

      expect(data.error.message).toMatch(/INVALID_PROVIDER|UNSUPPORTED_PROVIDER/)
    })

    it('should return error for missing redirect_uri', async () => {
      const response = await fetch(`${OAUTH_BASE_URL}/authorize?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'google',
        }),
      })

      expect(response.status).toBe(400)
      const data = (await response.json()) as ErrorResponse

      expect(data.error.message).toMatch(/MISSING_REDIRECT_URI|INVALID_REQUEST/)
    })

    it('should return error for invalid redirect_uri format', async () => {
      const request: OAuthAuthorizeRequest = {
        provider: 'google',
        redirect_uri: 'not-a-valid-url',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/authorize?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(400)
      const data = (await response.json()) as ErrorResponse

      expect(data.error.message).toMatch(/INVALID_REDIRECT_URI/)
    })

    it('should return error for missing API key', async () => {
      const request: OAuthAuthorizeRequest = {
        provider: 'google',
        redirect_uri: 'http://localhost:3000/auth/callback',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(400)
      const data = (await response.json()) as ErrorResponse

      expect(data.error.message).toMatch(/API_KEY_INVALID|MISSING_API_KEY/)
    })
  })

  describe('POST /auth.do/oauth/callback - OAuth callback handling', () => {
    /**
     * RED TEST: OAuth callback endpoint should exchange code for tokens
     *
     * This endpoint handles the OAuth callback by:
     * 1. Validating the state parameter (CSRF protection)
     * 2. Exchanging the authorization code for tokens via WorkOS API
     * 3. Fetching user profile from WorkOS
     * 4. Creating or updating user in Firebase Auth
     * 5. Generating Firebase session tokens
     */
    it('should exchange authorization code for Firebase tokens', async () => {
      // Note: In real tests, we'd need to mock WorkOS API or use test credentials
      const request: OAuthCallbackRequest = {
        code: 'test-authorization-code-123',
        state: 'test-state-456',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(200)
      const data = (await response.json()) as OAuthCallbackResponse

      expect(data).toHaveProperty('idToken')
      expect(data).toHaveProperty('refreshToken')
      expect(data).toHaveProperty('expiresIn')
      expect(data).toHaveProperty('localId')
      expect(data).toHaveProperty('providerId')
      expect(data).toHaveProperty('federatedId')
      expect(data).toHaveProperty('emailVerified')

      expect(typeof data.idToken).toBe('string')
      expect(typeof data.refreshToken).toBe('string')
      expect(typeof data.localId).toBe('string')
      expect(data.idToken.length).toBeGreaterThan(0)
      expect(data.refreshToken.length).toBeGreaterThan(0)
      expect(data.localId.length).toBeGreaterThan(0)

      // Provider ID should be the OAuth provider (google, microsoft, etc.)
      expect(['google', 'microsoft', 'okta', 'github', 'apple']).toContain(data.providerId)

      // Federated ID should be the user's ID from the OAuth provider
      expect(data.federatedId).toBeTruthy()
    })

    it('should create new user from OAuth profile on first sign-in', async () => {
      const request: OAuthCallbackRequest = {
        code: 'test-new-user-code-789',
        state: 'test-state-abc',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(200)
      const data = (await response.json()) as OAuthCallbackResponse

      // Should have user profile data from OAuth provider
      expect(data.email).toBeTruthy()
      expect(data.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)

      // Email from OAuth provider should be verified
      expect(data.emailVerified).toBe(true)

      // Should have display name and photo from OAuth profile
      if (data.displayName) {
        expect(typeof data.displayName).toBe('string')
        expect(data.displayName.length).toBeGreaterThan(0)
      }

      if (data.photoUrl) {
        expect(typeof data.photoUrl).toBe('string')
        expect(data.photoUrl).toMatch(/^https?:\/\//)
      }

      // Verify user was created by looking them up
      const lookupResponse = await fetch(`${BASE_URL}/accounts:lookup?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: data.idToken,
        }),
      })

      expect(lookupResponse.status).toBe(200)
      const lookupData = (await lookupResponse.json()) as LookupResponse

      expect(lookupData.users.length).toBe(1)
      expect(lookupData.users[0].localId).toBe(data.localId)
      expect(lookupData.users[0].email).toBe(data.email)
      expect(lookupData.users[0].emailVerified).toBe(true)

      // User should have OAuth provider in providerUserInfo
      const oauthProvider = lookupData.users[0].providerUserInfo.find(
        (p) => p.providerId === data.providerId
      )
      expect(oauthProvider).toBeTruthy()
      expect(oauthProvider?.federatedId).toBe(data.federatedId)
      expect(oauthProvider?.email).toBe(data.email)
    })

    it('should sign in existing user with OAuth provider', async () => {
      // First OAuth sign-in to create user
      const firstRequest: OAuthCallbackRequest = {
        code: 'test-existing-user-code-first',
        state: 'test-state-first',
      }

      const firstResponse = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(firstRequest),
      })

      expect(firstResponse.status).toBe(200)
      const firstData = (await firstResponse.json()) as OAuthCallbackResponse
      const userId = firstData.localId

      // Second OAuth sign-in with same user
      const secondRequest: OAuthCallbackRequest = {
        code: 'test-existing-user-code-second',
        state: 'test-state-second',
      }

      const secondResponse = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(secondRequest),
      })

      expect(secondResponse.status).toBe(200)
      const secondData = (await secondResponse.json()) as OAuthCallbackResponse

      // Should return same user ID
      expect(secondData.localId).toBe(userId)

      // Should issue new tokens
      expect(secondData.idToken).not.toBe(firstData.idToken)
      expect(secondData.refreshToken).not.toBe(firstData.refreshToken)
    })

    it('should link OAuth provider to existing email/password account', async () => {
      // Create email/password account first
      const email = generateTestEmail()
      const signUpResponse = await fetch(`${BASE_URL}/accounts:signUp?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password: 'testPassword123!',
          returnSecureToken: true,
        }),
      })

      expect(signUpResponse.status).toBe(200)
      const signUpData = await signUpResponse.json()
      const userId = signUpData.localId

      // Now sign in with OAuth using same email
      // Note: This would require mocking WorkOS to return the same email
      const oauthRequest: OAuthCallbackRequest = {
        code: 'test-link-account-code',
        state: 'test-state-link',
      }

      const oauthResponse = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(oauthRequest),
      })

      expect(oauthResponse.status).toBe(200)
      const oauthData = (await oauthResponse.json()) as OAuthCallbackResponse

      // Should link to existing user (same localId)
      // Or create new user depending on account linking policy
      expect(oauthData.localId).toBeTruthy()
      expect(oauthData.email).toBeTruthy()

      // Verify user has both providers
      const lookupResponse = await fetch(`${BASE_URL}/accounts:lookup?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: oauthData.idToken,
        }),
      })

      expect(lookupResponse.status).toBe(200)
      const lookupData = (await lookupResponse.json()) as LookupResponse

      // If account linking is enabled, should have both password and OAuth provider
      const user = lookupData.users[0]
      expect(user.providerUserInfo.length).toBeGreaterThanOrEqual(1)
    })

    it('should return error for invalid authorization code', async () => {
      const request: OAuthCallbackRequest = {
        code: 'invalid-code-xyz',
        state: 'test-state',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(400)
      const data = (await response.json()) as ErrorResponse

      expect(data.error.message).toMatch(/INVALID_CODE|INVALID_AUTHORIZATION_CODE/)
    })

    it('should return error for expired authorization code', async () => {
      const request: OAuthCallbackRequest = {
        code: 'expired-code-abc',
        state: 'test-state',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(400)
      const data = (await response.json()) as ErrorResponse

      expect(data.error.message).toMatch(/CODE_EXPIRED|EXPIRED_AUTHORIZATION_CODE/)
    })

    it('should return error for missing authorization code', async () => {
      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state: 'test-state',
        }),
      })

      expect(response.status).toBe(400)
      const data = (await response.json()) as ErrorResponse

      expect(data.error.message).toMatch(/MISSING_CODE|INVALID_REQUEST/)
    })

    it('should return error for invalid state parameter (CSRF protection)', async () => {
      const request: OAuthCallbackRequest = {
        code: 'valid-code',
        state: 'invalid-state',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(400)
      const data = (await response.json()) as ErrorResponse

      expect(data.error.message).toMatch(/INVALID_STATE|CSRF_TOKEN_MISMATCH/)
    })

    it('should return error for missing state parameter', async () => {
      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'valid-code',
        }),
      })

      expect(response.status).toBe(400)
      const data = (await response.json()) as ErrorResponse

      expect(data.error.message).toMatch(/MISSING_STATE|INVALID_REQUEST/)
    })

    it('should return error when WorkOS API fails', async () => {
      // This test simulates WorkOS API being down or returning an error
      const request: OAuthCallbackRequest = {
        code: 'trigger-workos-error',
        state: 'test-state',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(500)
      const data = (await response.json()) as ErrorResponse

      expect(data.error.message).toMatch(/OAUTH_PROVIDER_ERROR|EXTERNAL_SERVICE_ERROR/)
    })
  })

  describe('OAuth token validation and JWT structure', () => {
    /**
     * RED TEST: OAuth-issued tokens should have proper structure
     *
     * Tokens issued after OAuth callback should:
     * 1. Be valid JWTs with proper structure
     * 2. Contain OAuth provider information in firebase.sign_in_provider
     * 3. Include OAuth identities in firebase.identities
     * 4. Have proper email_verified claim (always true for OAuth)
     */
    it('should issue JWT with OAuth provider in sign_in_provider claim', async () => {
      const request: OAuthCallbackRequest = {
        code: 'test-jwt-structure-code',
        state: 'test-state',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(200)
      const data = (await response.json()) as OAuthCallbackResponse

      // Decode JWT (without verification for testing)
      const parts = data.idToken.split('.')
      expect(parts.length).toBe(3)

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

      expect(payload).toHaveProperty('firebase')
      expect(payload.firebase).toHaveProperty('sign_in_provider')
      expect(['google.com', 'microsoft.com', 'oidc.okta', 'github.com']).toContain(
        payload.firebase.sign_in_provider
      )

      expect(payload).toHaveProperty('email_verified')
      expect(payload.email_verified).toBe(true)

      expect(payload).toHaveProperty('email')
      expect(payload).toHaveProperty('user_id')
      expect(payload.user_id).toBe(data.localId)
    })

    it('should include OAuth identities in JWT firebase.identities claim', async () => {
      const request: OAuthCallbackRequest = {
        code: 'test-identities-code',
        state: 'test-state',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(200)
      const data = (await response.json()) as OAuthCallbackResponse

      const parts = data.idToken.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

      expect(payload.firebase).toHaveProperty('identities')
      expect(payload.firebase.identities).toHaveProperty('email')
      expect(Array.isArray(payload.firebase.identities.email)).toBe(true)

      // Should have OAuth provider identity
      const providerKey = `${data.providerId}.com`
      expect(payload.firebase.identities).toHaveProperty(providerKey)
      expect(Array.isArray(payload.firebase.identities[providerKey])).toBe(true)
      expect(payload.firebase.identities[providerKey]).toContain(data.federatedId)
    })

    it('should set email_verified to true for OAuth sign-ins', async () => {
      const request: OAuthCallbackRequest = {
        code: 'test-email-verified-code',
        state: 'test-state',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(200)
      const data = (await response.json()) as OAuthCallbackResponse

      // OAuth providers verify email, so emailVerified should always be true
      expect(data.emailVerified).toBe(true)

      // Verify in JWT as well
      const parts = data.idToken.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      expect(payload.email_verified).toBe(true)
    })
  })

  describe('OAuth user profile synchronization', () => {
    /**
     * RED TEST: User profile should be updated from OAuth provider
     *
     * On each OAuth sign-in, the user's profile should be updated with:
     * 1. Latest email from OAuth provider
     * 2. Latest display name
     * 3. Latest photo URL
     * 4. Email verification status (always true)
     */
    it('should update user profile from OAuth provider on each sign-in', async () => {
      // First sign-in
      const firstRequest: OAuthCallbackRequest = {
        code: 'test-profile-update-first',
        state: 'test-state-first',
      }

      const firstResponse = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(firstRequest),
      })

      expect(firstResponse.status).toBe(200)
      const firstData = (await firstResponse.json()) as OAuthCallbackResponse

      // Second sign-in (simulating profile changes in OAuth provider)
      const secondRequest: OAuthCallbackRequest = {
        code: 'test-profile-update-second',
        state: 'test-state-second',
      }

      const secondResponse = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(secondRequest),
      })

      expect(secondResponse.status).toBe(200)
      const secondData = (await secondResponse.json()) as OAuthCallbackResponse

      // Should be same user
      expect(secondData.localId).toBe(firstData.localId)

      // Profile should be updated from OAuth provider
      // Note: In real implementation, this would reflect actual changes from WorkOS
      expect(secondData.email).toBeTruthy()
      expect(secondData.emailVerified).toBe(true)

      // Verify updated profile via lookup
      const lookupResponse = await fetch(`${BASE_URL}/accounts:lookup?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: secondData.idToken,
        }),
      })

      expect(lookupResponse.status).toBe(200)
      const lookupData = (await lookupResponse.json()) as LookupResponse

      const user = lookupData.users[0]
      expect(user.email).toBe(secondData.email)
      expect(user.emailVerified).toBe(true)
      expect(user.displayName).toBe(secondData.displayName)
      expect(user.photoUrl).toBe(secondData.photoUrl)
    })

    it('should preserve user data not provided by OAuth provider', async () => {
      // Create user with email/password first
      const email = generateTestEmail()
      const signUpResponse = await fetch(`${BASE_URL}/accounts:signUp?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password: 'testPassword123!',
          displayName: 'Original Name',
          returnSecureToken: true,
        }),
      })

      const signUpData = await signUpResponse.json()
      const userId = signUpData.localId

      // Sign in with OAuth
      const oauthRequest: OAuthCallbackRequest = {
        code: 'test-preserve-data-code',
        state: 'test-state',
      }

      const oauthResponse = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(oauthRequest),
      })

      expect(oauthResponse.status).toBe(200)
      const oauthData = (await oauthResponse.json()) as OAuthCallbackResponse

      // Look up user to verify profile
      const lookupResponse = await fetch(`${BASE_URL}/accounts:lookup?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: oauthData.idToken,
        }),
      })

      expect(lookupResponse.status).toBe(200)
      const lookupData = (await lookupResponse.json()) as LookupResponse

      const user = lookupData.users[0]

      // Password should still be preserved (for account with both password and OAuth)
      // Note: passwordHash should never be in API response
      expect(user).not.toHaveProperty('passwordHash')

      // User should have both password and OAuth providers
      const providers = user.providerUserInfo.map((p) => p.providerId)
      expect(providers).toContain('password')
      expect(providers.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('OAuth security and edge cases', () => {
    /**
     * RED TEST: Security considerations for OAuth flow
     */
    it('should not expose WorkOS API keys or secrets in responses', async () => {
      const request: OAuthCallbackRequest = {
        code: 'test-security-code',
        state: 'test-state',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      const responseText = await response.text()

      // Should not contain sensitive keys
      expect(responseText).not.toMatch(/sk_live/i)
      expect(responseText).not.toMatch(/client_secret/i)
      expect(responseText).not.toMatch(/workos_api_key/i)
      expect(responseText).not.toMatch(/api_secret/i)
    })

    it('should handle concurrent OAuth sign-ins for same user', async () => {
      // Simulate race condition with concurrent OAuth callbacks
      const request: OAuthCallbackRequest = {
        code: 'test-concurrent-code',
        state: 'test-state',
      }

      const promises = [
        fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }),
        fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }),
      ]

      const responses = await Promise.all(promises)

      // At least one should succeed
      const successResponses = responses.filter((r) => r.status === 200)
      expect(successResponses.length).toBeGreaterThanOrEqual(1)

      if (successResponses.length === 2) {
        const data1 = (await successResponses[0].json()) as OAuthCallbackResponse
        const data2 = (await successResponses[1].json()) as OAuthCallbackResponse

        // Both should return same user ID
        expect(data1.localId).toBe(data2.localId)
      }
    })

    it('should handle OAuth error responses from WorkOS', async () => {
      // Simulate OAuth provider error (e.g., user denied access)
      const request: OAuthCallbackRequest = {
        code: 'trigger-oauth-denial',
        state: 'test-state',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      expect(response.status).toBe(400)
      const data = (await response.json()) as ErrorResponse

      expect(data.error.message).toMatch(/ACCESS_DENIED|USER_CANCELLED|OAUTH_ERROR/)
    })

    it('should handle malformed OAuth profile data gracefully', async () => {
      // Test with code that returns incomplete profile
      const request: OAuthCallbackRequest = {
        code: 'malformed-profile-code',
        state: 'test-state',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      // Should either succeed with defaults or return clear error
      expect([200, 400]).toContain(response.status)

      if (response.status === 200) {
        const data = (await response.json()) as OAuthCallbackResponse
        // Should have at minimum: localId, tokens, providerId
        expect(data.localId).toBeTruthy()
        expect(data.idToken).toBeTruthy()
        expect(data.refreshToken).toBeTruthy()
        expect(data.providerId).toBeTruthy()
      }
    })

    it('should handle OAuth provider returning no email', async () => {
      // Some OAuth providers don't always return email
      const request: OAuthCallbackRequest = {
        code: 'no-email-code',
        state: 'test-state',
      }

      const response = await fetch(`${OAUTH_BASE_URL}/callback?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      // Should either succeed without email or return error based on policy
      expect([200, 400]).toContain(response.status)

      if (response.status === 400) {
        const data = (await response.json()) as ErrorResponse
        expect(data.error.message).toMatch(/EMAIL_REQUIRED|MISSING_EMAIL/)
      }
    })
  })
})
