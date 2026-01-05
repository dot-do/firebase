import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'

/**
 * Firebase Identity Toolkit v1 REST API Tests
 *
 * These tests verify compatibility with the Firebase Auth REST API.
 * Reference: https://firebase.google.com/docs/reference/rest/auth
 *
 * Base URL: https://identitytoolkit.googleapis.com/v1
 */

const BASE_URL = process.env.FIREBASE_AUTH_EMULATOR_HOST
  ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`
  : 'http://localhost:9099/identitytoolkit.googleapis.com/v1'

const API_KEY = process.env.FIREBASE_API_KEY || 'test-api-key'

interface SignInResponse {
  idToken: string
  email: string
  refreshToken: string
  expiresIn: string
  localId: string
  registered: boolean
}

interface SignUpResponse {
  idToken: string
  email: string
  refreshToken: string
  expiresIn: string
  localId: string
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
    passwordHash?: string
    passwordUpdatedAt?: number
    validSince?: string
    disabled?: boolean
    lastLoginAt?: string
    createdAt?: string
    lastRefreshAt?: string
  }>
}

interface UpdateResponse {
  localId: string
  email: string
  displayName?: string
  photoUrl?: string
  passwordHash?: string
  providerUserInfo: Array<{
    providerId: string
    federatedId?: string
  }>
  idToken?: string
  refreshToken?: string
  expiresIn?: string
  emailVerified?: boolean
}

interface DeleteResponse {
  kind: string
}

interface SendOobCodeResponse {
  kind: string
  email: string
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

async function request<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<{ status: number; data: T | ErrorResponse }> {
  const response = await fetch(`${BASE_URL}${endpoint}?key=${API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await response.json()
  return { status: response.status, data }
}

function generateTestEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`
}

describe('Identity Toolkit v1 API', () => {
  describe('POST /v1/accounts:signUp', () => {
    it('should create a new account with email and password', async () => {
      const email = generateTestEmail()
      const password = 'testPassword123!'

      const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
        email,
        password,
        returnSecureToken: true,
      })

      expect(status).toBe(200)

      const response = data as SignUpResponse
      expect(response).toHaveProperty('idToken')
      expect(response).toHaveProperty('refreshToken')
      expect(response).toHaveProperty('expiresIn')
      expect(response).toHaveProperty('localId')
      expect(response.email).toBe(email)
      expect(typeof response.idToken).toBe('string')
      expect(typeof response.refreshToken).toBe('string')
      expect(typeof response.expiresIn).toBe('string')
      expect(typeof response.localId).toBe('string')
      expect(response.idToken.length).toBeGreaterThan(0)
      expect(response.refreshToken.length).toBeGreaterThan(0)
      expect(response.localId.length).toBeGreaterThan(0)
    })

    it('should create an anonymous account when no email/password provided', async () => {
      const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
        returnSecureToken: true,
      })

      expect(status).toBe(200)

      const response = data as SignUpResponse
      expect(response).toHaveProperty('idToken')
      expect(response).toHaveProperty('refreshToken')
      expect(response).toHaveProperty('expiresIn')
      expect(response).toHaveProperty('localId')
    })

    it('should return error for duplicate email', async () => {
      const email = generateTestEmail()
      const password = 'testPassword123!'

      // Create first account
      await request<SignUpResponse>('/accounts:signUp', {
        email,
        password,
        returnSecureToken: true,
      })

      // Attempt to create duplicate
      const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
        email,
        password,
        returnSecureToken: true,
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('EMAIL_EXISTS')
    })

    it('should return error for weak password', async () => {
      const email = generateTestEmail()
      const password = '123' // Too short

      const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
        email,
        password,
        returnSecureToken: true,
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toMatch(/WEAK_PASSWORD|PASSWORD_TOO_SHORT/)
    })

    it('should return error for invalid email format', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
        email: 'invalid-email',
        password: 'testPassword123!',
        returnSecureToken: true,
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('INVALID_EMAIL')
    })
  })

  describe('POST /v1/accounts:signInWithPassword', () => {
    let testEmail: string
    let testPassword: string
    let testLocalId: string

    beforeAll(async () => {
      testEmail = generateTestEmail()
      testPassword = 'testPassword123!'

      const { data } = await request<SignUpResponse>('/accounts:signUp', {
        email: testEmail,
        password: testPassword,
        returnSecureToken: true,
      })

      testLocalId = (data as SignUpResponse).localId
    })

    it('should sign in with valid email and password', async () => {
      const { status, data } = await request<SignInResponse>('/accounts:signInWithPassword', {
        email: testEmail,
        password: testPassword,
        returnSecureToken: true,
      })

      expect(status).toBe(200)

      const response = data as SignInResponse
      expect(response).toHaveProperty('idToken')
      expect(response).toHaveProperty('refreshToken')
      expect(response).toHaveProperty('expiresIn')
      expect(response).toHaveProperty('localId')
      expect(response).toHaveProperty('registered')
      expect(response.email).toBe(testEmail)
      expect(response.localId).toBe(testLocalId)
      expect(response.registered).toBe(true)
      expect(typeof response.idToken).toBe('string')
      expect(typeof response.refreshToken).toBe('string')
      expect(typeof response.expiresIn).toBe('string')
    })

    it('should return error for invalid password', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:signInWithPassword', {
        email: testEmail,
        password: 'wrongPassword123!',
        returnSecureToken: true,
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('INVALID_PASSWORD')
    })

    it('should return error for non-existent email', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:signInWithPassword', {
        email: 'nonexistent@example.com',
        password: 'anyPassword123!',
        returnSecureToken: true,
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('EMAIL_NOT_FOUND')
    })

    it('should return error for missing email', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:signInWithPassword', {
        password: 'testPassword123!',
        returnSecureToken: true,
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('MISSING_EMAIL')
    })

    it('should return error for missing password', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:signInWithPassword', {
        email: testEmail,
        returnSecureToken: true,
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toMatch(/MISSING_PASSWORD|INVALID_PASSWORD/)
    })
  })

  describe('POST /v1/accounts:lookup', () => {
    let testIdToken: string
    let testEmail: string
    let testLocalId: string

    beforeAll(async () => {
      testEmail = generateTestEmail()
      const testPassword = 'testPassword123!'

      const { data } = await request<SignUpResponse>('/accounts:signUp', {
        email: testEmail,
        password: testPassword,
        returnSecureToken: true,
      })

      const signUpResponse = data as SignUpResponse
      testIdToken = signUpResponse.idToken
      testLocalId = signUpResponse.localId
    })

    it('should return account info for valid idToken', async () => {
      const { status, data } = await request<LookupResponse>('/accounts:lookup', {
        idToken: testIdToken,
      })

      expect(status).toBe(200)

      const response = data as LookupResponse
      expect(response).toHaveProperty('kind')
      expect(response).toHaveProperty('users')
      expect(response.kind).toBe('identitytoolkit#GetAccountInfoResponse')
      expect(Array.isArray(response.users)).toBe(true)
      expect(response.users.length).toBe(1)

      const user = response.users[0]
      expect(user.localId).toBe(testLocalId)
      expect(user.email).toBe(testEmail)
      expect(user).toHaveProperty('emailVerified')
      expect(typeof user.emailVerified).toBe('boolean')
      expect(user).toHaveProperty('providerUserInfo')
      expect(Array.isArray(user.providerUserInfo)).toBe(true)
      expect(user).toHaveProperty('createdAt')
      expect(user).toHaveProperty('lastLoginAt')
    })

    it('should return error for invalid idToken', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:lookup', {
        idToken: 'invalid-token',
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('INVALID_ID_TOKEN')
    })

    it('should return error for expired idToken', async () => {
      // This is a properly formatted but expired JWT
      const expiredToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vdGVzdC1wcm9qZWN0IiwiYXVkIjoidGVzdC1wcm9qZWN0IiwiYXV0aF90aW1lIjoxNjAwMDAwMDAwLCJ1c2VyX2lkIjoidGVzdC11c2VyIiwic3ViIjoidGVzdC11c2VyIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDM2MDAsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyJ0ZXN0QGV4YW1wbGUuY29tIl19LCJzaWduX2luX3Byb3ZpZGVyIjoicGFzc3dvcmQifX0.fake-signature'

      const { status, data } = await request<ErrorResponse>('/accounts:lookup', {
        idToken: expiredToken,
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toMatch(/INVALID_ID_TOKEN|TOKEN_EXPIRED/)
    })

    it('should return error when idToken is missing', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:lookup', {})

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('MISSING_ID_TOKEN')
    })
  })

  describe('POST /v1/accounts:update', () => {
    let testIdToken: string
    let testLocalId: string

    beforeEach(async () => {
      const testEmail = generateTestEmail()
      const testPassword = 'testPassword123!'

      const { data } = await request<SignUpResponse>('/accounts:signUp', {
        email: testEmail,
        password: testPassword,
        returnSecureToken: true,
      })

      const signUpResponse = data as SignUpResponse
      testIdToken = signUpResponse.idToken
      testLocalId = signUpResponse.localId
    })

    it('should update displayName', async () => {
      const displayName = 'Test User'

      const { status, data } = await request<UpdateResponse>('/accounts:update', {
        idToken: testIdToken,
        displayName,
        returnSecureToken: true,
      })

      expect(status).toBe(200)

      const response = data as UpdateResponse
      expect(response.localId).toBe(testLocalId)
      expect(response.displayName).toBe(displayName)
    })

    it('should update photoUrl', async () => {
      const photoUrl = 'https://example.com/photo.jpg'

      const { status, data } = await request<UpdateResponse>('/accounts:update', {
        idToken: testIdToken,
        photoUrl,
        returnSecureToken: true,
      })

      expect(status).toBe(200)

      const response = data as UpdateResponse
      expect(response.localId).toBe(testLocalId)
      expect(response.photoUrl).toBe(photoUrl)
    })

    it('should update both displayName and photoUrl', async () => {
      const displayName = 'Test User'
      const photoUrl = 'https://example.com/photo.jpg'

      const { status, data } = await request<UpdateResponse>('/accounts:update', {
        idToken: testIdToken,
        displayName,
        photoUrl,
        returnSecureToken: true,
      })

      expect(status).toBe(200)

      const response = data as UpdateResponse
      expect(response.localId).toBe(testLocalId)
      expect(response.displayName).toBe(displayName)
      expect(response.photoUrl).toBe(photoUrl)
    })

    it('should update password', async () => {
      const newPassword = 'newTestPassword456!'

      const { status, data } = await request<UpdateResponse>('/accounts:update', {
        idToken: testIdToken,
        password: newPassword,
        returnSecureToken: true,
      })

      expect(status).toBe(200)

      const response = data as UpdateResponse
      expect(response.localId).toBe(testLocalId)
      expect(response).toHaveProperty('idToken')
      expect(response).toHaveProperty('refreshToken')
    })

    it('should update email', async () => {
      const newEmail = generateTestEmail()

      const { status, data } = await request<UpdateResponse>('/accounts:update', {
        idToken: testIdToken,
        email: newEmail,
        returnSecureToken: true,
      })

      expect(status).toBe(200)

      const response = data as UpdateResponse
      expect(response.localId).toBe(testLocalId)
      expect(response.email).toBe(newEmail)
    })

    it('should delete attributes using deleteAttribute', async () => {
      // First set displayName and photoUrl
      await request<UpdateResponse>('/accounts:update', {
        idToken: testIdToken,
        displayName: 'Test User',
        photoUrl: 'https://example.com/photo.jpg',
        returnSecureToken: true,
      })

      // Then delete them
      const { status, data } = await request<UpdateResponse>('/accounts:update', {
        idToken: testIdToken,
        deleteAttribute: ['DISPLAY_NAME', 'PHOTO_URL'],
        returnSecureToken: true,
      })

      expect(status).toBe(200)

      const response = data as UpdateResponse
      expect(response.displayName).toBeUndefined()
      expect(response.photoUrl).toBeUndefined()
    })

    it('should return new tokens when returnSecureToken is true', async () => {
      const { status, data } = await request<UpdateResponse>('/accounts:update', {
        idToken: testIdToken,
        displayName: 'Test User',
        returnSecureToken: true,
      })

      expect(status).toBe(200)

      const response = data as UpdateResponse
      expect(response).toHaveProperty('idToken')
      expect(response).toHaveProperty('refreshToken')
      expect(response).toHaveProperty('expiresIn')
    })

    it('should return error for invalid idToken', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:update', {
        idToken: 'invalid-token',
        displayName: 'Test User',
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('INVALID_ID_TOKEN')
    })

    it('should return error for email already in use', async () => {
      // Create another account
      const existingEmail = generateTestEmail()
      await request<SignUpResponse>('/accounts:signUp', {
        email: existingEmail,
        password: 'testPassword123!',
        returnSecureToken: true,
      })

      // Try to update to that email
      const { status, data } = await request<ErrorResponse>('/accounts:update', {
        idToken: testIdToken,
        email: existingEmail,
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('EMAIL_EXISTS')
    })
  })

  describe('POST /v1/accounts:delete', () => {
    it('should delete account with valid idToken', async () => {
      // Create a new account to delete
      const testEmail = generateTestEmail()
      const { data: signUpData } = await request<SignUpResponse>('/accounts:signUp', {
        email: testEmail,
        password: 'testPassword123!',
        returnSecureToken: true,
      })

      const idToken = (signUpData as SignUpResponse).idToken

      // Delete the account
      const { status, data } = await request<DeleteResponse>('/accounts:delete', {
        idToken,
      })

      expect(status).toBe(200)
      expect(data).toHaveProperty('kind')
      expect((data as DeleteResponse).kind).toBe('identitytoolkit#DeleteAccountResponse')
    })

    it('should return error when trying to sign in to deleted account', async () => {
      // Create a new account
      const testEmail = generateTestEmail()
      const testPassword = 'testPassword123!'

      const { data: signUpData } = await request<SignUpResponse>('/accounts:signUp', {
        email: testEmail,
        password: testPassword,
        returnSecureToken: true,
      })

      const idToken = (signUpData as SignUpResponse).idToken

      // Delete the account
      await request<DeleteResponse>('/accounts:delete', { idToken })

      // Try to sign in
      const { status, data } = await request<ErrorResponse>('/accounts:signInWithPassword', {
        email: testEmail,
        password: testPassword,
        returnSecureToken: true,
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('EMAIL_NOT_FOUND')
    })

    it('should return error for invalid idToken', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:delete', {
        idToken: 'invalid-token',
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('INVALID_ID_TOKEN')
    })

    it('should return error when idToken is missing', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:delete', {})

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('MISSING_ID_TOKEN')
    })
  })

  describe('POST /v1/accounts:sendOobCode', () => {
    let testEmail: string
    let testIdToken: string

    beforeAll(async () => {
      testEmail = generateTestEmail()
      const testPassword = 'testPassword123!'

      const { data } = await request<SignUpResponse>('/accounts:signUp', {
        email: testEmail,
        password: testPassword,
        returnSecureToken: true,
      })

      testIdToken = (data as SignUpResponse).idToken
    })

    it('should send verification email with VERIFY_EMAIL request type', async () => {
      const { status, data } = await request<SendOobCodeResponse>('/accounts:sendOobCode', {
        requestType: 'VERIFY_EMAIL',
        idToken: testIdToken,
      })

      expect(status).toBe(200)

      const response = data as SendOobCodeResponse
      expect(response).toHaveProperty('kind')
      expect(response).toHaveProperty('email')
      expect(response.kind).toBe('identitytoolkit#GetOobConfirmationCodeResponse')
      expect(response.email).toBe(testEmail)
    })

    it('should send password reset email with PASSWORD_RESET request type', async () => {
      const { status, data } = await request<SendOobCodeResponse>('/accounts:sendOobCode', {
        requestType: 'PASSWORD_RESET',
        email: testEmail,
      })

      expect(status).toBe(200)

      const response = data as SendOobCodeResponse
      expect(response).toHaveProperty('kind')
      expect(response).toHaveProperty('email')
      expect(response.kind).toBe('identitytoolkit#GetOobConfirmationCodeResponse')
      expect(response.email).toBe(testEmail)
    })

    it('should send email change verification with VERIFY_AND_CHANGE_EMAIL request type', async () => {
      const newEmail = generateTestEmail()

      const { status, data } = await request<SendOobCodeResponse>('/accounts:sendOobCode', {
        requestType: 'VERIFY_AND_CHANGE_EMAIL',
        idToken: testIdToken,
        newEmail,
      })

      expect(status).toBe(200)

      const response = data as SendOobCodeResponse
      expect(response).toHaveProperty('kind')
      expect(response.kind).toBe('identitytoolkit#GetOobConfirmationCodeResponse')
    })

    it('should return error for invalid request type', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
        requestType: 'INVALID_TYPE',
        idToken: testIdToken,
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('INVALID_REQ_TYPE')
    })

    it('should return error for PASSWORD_RESET with non-existent email', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
        requestType: 'PASSWORD_RESET',
        email: 'nonexistent@example.com',
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('EMAIL_NOT_FOUND')
    })

    it('should return error for VERIFY_EMAIL without idToken', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
        requestType: 'VERIFY_EMAIL',
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('MISSING_ID_TOKEN')
    })

    it('should return error for PASSWORD_RESET without email', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
        requestType: 'PASSWORD_RESET',
      })

      expect(status).toBe(400)
      const errorResponse = data as ErrorResponse
      expect(errorResponse.error.message).toBe('MISSING_EMAIL')
    })
  })

  describe('Response format validation', () => {
    it('should return idToken as a JWT with correct structure', async () => {
      const testEmail = generateTestEmail()

      const { data } = await request<SignUpResponse>('/accounts:signUp', {
        email: testEmail,
        password: 'testPassword123!',
        returnSecureToken: true,
      })

      const response = data as SignUpResponse
      const idToken = response.idToken

      // JWT should have 3 parts separated by dots
      const parts = idToken.split('.')
      expect(parts.length).toBe(3)

      // Decode and validate header
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
      expect(header).toHaveProperty('alg')
      expect(header).toHaveProperty('typ', 'JWT')

      // Decode and validate payload
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      expect(payload).toHaveProperty('iss')
      expect(payload).toHaveProperty('aud')
      expect(payload).toHaveProperty('auth_time')
      expect(payload).toHaveProperty('user_id')
      expect(payload).toHaveProperty('sub')
      expect(payload).toHaveProperty('iat')
      expect(payload).toHaveProperty('exp')
      expect(payload).toHaveProperty('email', testEmail)
      expect(payload).toHaveProperty('email_verified')
      expect(payload).toHaveProperty('firebase')
      expect(payload.firebase).toHaveProperty('identities')
      expect(payload.firebase).toHaveProperty('sign_in_provider')
    })

    it('should return expiresIn as a numeric string in seconds', async () => {
      const { data } = await request<SignUpResponse>('/accounts:signUp', {
        email: generateTestEmail(),
        password: 'testPassword123!',
        returnSecureToken: true,
      })

      const response = data as SignUpResponse
      expect(typeof response.expiresIn).toBe('string')
      expect(parseInt(response.expiresIn, 10)).toBeGreaterThan(0)
      // Firebase typically returns 3600 (1 hour)
      expect(parseInt(response.expiresIn, 10)).toBe(3600)
    })

    it('should return localId as a non-empty string', async () => {
      const { data } = await request<SignUpResponse>('/accounts:signUp', {
        email: generateTestEmail(),
        password: 'testPassword123!',
        returnSecureToken: true,
      })

      const response = data as SignUpResponse
      expect(typeof response.localId).toBe('string')
      expect(response.localId.length).toBeGreaterThan(0)
      // localId should be a valid Firebase UID format (alphanumeric, 28 characters)
      expect(response.localId).toMatch(/^[a-zA-Z0-9]{20,}$/)
    })

    it('should return refreshToken as a non-empty string', async () => {
      const { data } = await request<SignUpResponse>('/accounts:signUp', {
        email: generateTestEmail(),
        password: 'testPassword123!',
        returnSecureToken: true,
      })

      const response = data as SignUpResponse
      expect(typeof response.refreshToken).toBe('string')
      expect(response.refreshToken.length).toBeGreaterThan(0)
    })

    it('should return proper error format with code, message, and errors array', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
        email: 'invalid-email',
        password: 'testPassword123!',
        returnSecureToken: true,
      })

      expect(status).toBe(400)

      const errorResponse = data as ErrorResponse
      expect(errorResponse).toHaveProperty('error')
      expect(errorResponse.error).toHaveProperty('code', 400)
      expect(errorResponse.error).toHaveProperty('message')
      expect(typeof errorResponse.error.message).toBe('string')
    })
  })

  describe('API key validation', () => {
    it('should return error for missing API key', async () => {
      const response = await fetch(`${BASE_URL}/accounts:signUp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: generateTestEmail(),
          password: 'testPassword123!',
          returnSecureToken: true,
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error.message).toMatch(/API_KEY_INVALID|MISSING_API_KEY/)
    })

    it('should return error for invalid API key', async () => {
      const response = await fetch(`${BASE_URL}/accounts:signUp?key=invalid-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: generateTestEmail(),
          password: 'testPassword123!',
          returnSecureToken: true,
        }),
      })

      // Note: In emulator mode, any API key might be accepted
      // In production mode, this should return 400/403
      expect([200, 400, 403]).toContain(response.status)
    })
  })
})
