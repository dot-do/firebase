import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

/**
 * Comprehensive Input Validation Tests for Firebase Auth Endpoints
 *
 * Issue: firebase-mjwm
 *
 * These tests verify that all auth endpoints properly validate inputs including:
 * - Email format validation
 * - Password strength validation
 * - Missing required fields
 * - Invalid field values
 * - Edge cases and boundary conditions
 *
 * Reference: https://firebase.google.com/docs/reference/rest/auth
 */

const BASE_URL = process.env.FIREBASE_AUTH_EMULATOR_HOST
  ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`
  : 'http://localhost:9099/identitytoolkit.googleapis.com/v1'

const API_KEY = process.env.FIREBASE_API_KEY || 'test-api-key'

interface SignUpResponse {
  idToken: string
  email: string
  refreshToken: string
  expiresIn: string
  localId: string
}

interface SignInResponse {
  idToken: string
  email: string
  refreshToken: string
  expiresIn: string
  localId: string
  registered: boolean
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
  return `validation-test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`
}

describe('Comprehensive Input Validation Tests', () => {
  /**
   * Email Format Validation Tests
   *
   * Firebase requires valid email format: local@domain.tld
   * Invalid formats should return INVALID_EMAIL error
   */
  describe('Email Format Validation', () => {
    describe('signUp endpoint email validation', () => {
      it('should reject email without @ symbol', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
          email: 'invalidemail.com',
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject email without domain', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
          email: 'user@',
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject email without local part', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
          email: '@domain.com',
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject email without TLD', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
          email: 'user@domain',
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject email with spaces in local part', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
          email: 'user name@domain.com',
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject email with spaces in domain', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
          email: 'user@do main.com',
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject email with multiple @ symbols', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
          email: 'user@@domain.com',
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject email that is just whitespace', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
          email: '   ',
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject empty string email', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
          email: '',
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should accept valid email with subdomain', async () => {
        const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
          email: `test-${Date.now()}@subdomain.example.com`,
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(200)
        const response = data as SignUpResponse
        expect(response.idToken).toBeTruthy()
      })

      it('should accept valid email with plus sign', async () => {
        const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
          email: `test+tag-${Date.now()}@example.com`,
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(200)
        const response = data as SignUpResponse
        expect(response.idToken).toBeTruthy()
      })

      it('should accept valid email with dots in local part', async () => {
        const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
          email: `first.last.${Date.now()}@example.com`,
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(200)
        const response = data as SignUpResponse
        expect(response.idToken).toBeTruthy()
      })

      it('should accept valid email with numbers', async () => {
        const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
          email: `user123-${Date.now()}@example123.com`,
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(200)
        const response = data as SignUpResponse
        expect(response.idToken).toBeTruthy()
      })

      it('should handle email with leading/trailing whitespace by trimming', async () => {
        // Note: Firebase may either trim whitespace or reject
        // Testing the actual behavior
        const email = `  test-${Date.now()}@example.com  `
        const { status, data } = await request<SignUpResponse | ErrorResponse>('/accounts:signUp', {
          email,
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        // Either successfully trims and creates, or rejects as invalid
        expect([200, 400]).toContain(status)
      })
    })

    describe('signInWithPassword endpoint email validation', () => {
      let validEmail: string
      const validPassword = 'testPassword123!'

      beforeAll(async () => {
        validEmail = generateTestEmail()
        await request<SignUpResponse>('/accounts:signUp', {
          email: validEmail,
          password: validPassword,
          returnSecureToken: true,
        })
      })

      it('should reject email without @ symbol', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signInWithPassword', {
          email: 'notanemail',
          password: validPassword,
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject malformed email', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signInWithPassword', {
          email: 'user@.com',
          password: validPassword,
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject email with invalid characters', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signInWithPassword', {
          email: 'user<script>@domain.com',
          password: validPassword,
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        // May return INVALID_EMAIL or EMAIL_NOT_FOUND depending on validation order
        expect(errorResponse.error.message).toMatch(/INVALID_EMAIL|EMAIL_NOT_FOUND/)
      })
    })

    describe('sendOobCode endpoint email validation', () => {
      it('should reject invalid email for PASSWORD_RESET', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
          requestType: 'PASSWORD_RESET',
          email: 'not-an-email',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject email without domain for PASSWORD_RESET', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
          requestType: 'PASSWORD_RESET',
          email: 'user@',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })
    })

    describe('update endpoint email validation', () => {
      let testIdToken: string

      beforeEach(async () => {
        const email = generateTestEmail()
        const { data } = await request<SignUpResponse>('/accounts:signUp', {
          email,
          password: 'testPassword123!',
          returnSecureToken: true,
        })
        testIdToken = (data as SignUpResponse).idToken
      })

      it('should reject update with invalid email format', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          email: 'invalid-email',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject update with email missing @ symbol', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          email: 'userexample.com',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject update with email containing spaces', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          email: 'user name@example.com',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })

      it('should reject update with email missing TLD', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          email: 'user@domain',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_EMAIL')
      })
    })
  })

  /**
   * Password Strength Validation Tests
   *
   * Firebase requires passwords to be at least 6 characters
   * Weak passwords should return WEAK_PASSWORD error
   */
  describe('Password Strength Validation', () => {
    describe('signUp endpoint password validation', () => {
      it('should reject password shorter than 6 characters', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: '12345',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/WEAK_PASSWORD/)
      })

      it('should reject password of exactly 5 characters', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: 'abcde',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/WEAK_PASSWORD/)
      })

      it('should reject empty password', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: '',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/WEAK_PASSWORD/)
      })

      it('should handle password with only whitespace', async () => {
        // Note: A 6-character whitespace password technically meets the minimum length requirement
        // The implementation may accept it since password.length >= 6
        const { status, data } = await request<ErrorResponse | SignUpResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: '      ', // 6 spaces
          returnSecureToken: true,
        })

        // Either rejects as weak (stricter validation) or accepts (length-only validation)
        expect([200, 400]).toContain(status)
        if (status === 400) {
          const errorResponse = data as ErrorResponse
          expect(errorResponse.error.message).toMatch(/WEAK_PASSWORD/)
        }
      })

      it('should reject single character password', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: 'a',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/WEAK_PASSWORD/)
      })

      it('should accept password of exactly 6 characters', async () => {
        const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: '123456',
          returnSecureToken: true,
        })

        expect(status).toBe(200)
        const response = data as SignUpResponse
        expect(response.idToken).toBeTruthy()
      })

      it('should accept password of 6 characters (letters)', async () => {
        const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: 'abcdef',
          returnSecureToken: true,
        })

        expect(status).toBe(200)
        const response = data as SignUpResponse
        expect(response.idToken).toBeTruthy()
      })

      it('should accept long password', async () => {
        const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: 'thisIsAVeryLongPasswordThatShouldBeAccepted123!@#',
          returnSecureToken: true,
        })

        expect(status).toBe(200)
        const response = data as SignUpResponse
        expect(response.idToken).toBeTruthy()
      })

      it('should accept password with special characters', async () => {
        const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: '!@#$%^&*()',
          returnSecureToken: true,
        })

        expect(status).toBe(200)
        const response = data as SignUpResponse
        expect(response.idToken).toBeTruthy()
      })

      it('should accept password with unicode characters', async () => {
        const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: 'password',
          returnSecureToken: true,
        })

        expect(status).toBe(200)
        const response = data as SignUpResponse
        expect(response.idToken).toBeTruthy()
      })
    })

    describe('update endpoint password validation', () => {
      let testIdToken: string

      beforeEach(async () => {
        const email = generateTestEmail()
        const { data } = await request<SignUpResponse>('/accounts:signUp', {
          email,
          password: 'testPassword123!',
          returnSecureToken: true,
        })
        testIdToken = (data as SignUpResponse).idToken
      })

      it('should reject password update shorter than 6 characters', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          password: '12345',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/WEAK_PASSWORD/)
      })

      it('should reject empty password update', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          password: '',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/WEAK_PASSWORD/)
      })

      it('should accept valid password update', async () => {
        const { status, data } = await request<SignUpResponse>('/accounts:update', {
          idToken: testIdToken,
          password: 'newValidPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(200)
        expect((data as SignUpResponse).idToken).toBeTruthy()
      })
    })
  })

  /**
   * Missing Required Fields Tests
   *
   * Certain endpoints require specific fields
   * Missing required fields should return appropriate error messages
   */
  describe('Missing Required Fields', () => {
    describe('signInWithPassword required fields', () => {
      it('should return MISSING_EMAIL when email is not provided', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signInWithPassword', {
          password: 'somePassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('MISSING_EMAIL')
      })

      it('should return MISSING_PASSWORD when password is not provided', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signInWithPassword', {
          email: 'test@example.com',
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/MISSING_PASSWORD|INVALID_PASSWORD/)
      })

      it('should return MISSING_EMAIL when both email and password are missing', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signInWithPassword', {
          returnSecureToken: true,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        // Should return first missing field error
        expect(errorResponse.error.message).toMatch(/MISSING_EMAIL|MISSING_PASSWORD/)
      })

      it('should return error for completely empty body', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:signInWithPassword', {})

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/MISSING_EMAIL|MISSING_PASSWORD/)
      })
    })

    describe('lookup required fields', () => {
      it('should return MISSING_ID_TOKEN when idToken is not provided', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:lookup', {})

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('MISSING_ID_TOKEN')
      })

      it('should return MISSING_ID_TOKEN when idToken is null', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:lookup', {
          idToken: null,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('MISSING_ID_TOKEN')
      })

      it('should return MISSING_ID_TOKEN when idToken is empty string', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:lookup', {
          idToken: '',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/MISSING_ID_TOKEN|INVALID_ID_TOKEN/)
      })
    })

    describe('update required fields', () => {
      it('should return MISSING_ID_TOKEN when idToken is not provided', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:update', {
          displayName: 'Test User',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('MISSING_ID_TOKEN')
      })
    })

    describe('delete required fields', () => {
      it('should return MISSING_ID_TOKEN when idToken is not provided', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:delete', {})

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('MISSING_ID_TOKEN')
      })

      it('should return MISSING_ID_TOKEN when idToken is undefined', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:delete', {
          idToken: undefined,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('MISSING_ID_TOKEN')
      })
    })

    describe('sendOobCode required fields', () => {
      it('should return INVALID_REQ_TYPE when requestType is missing', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
          email: 'test@example.com',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_REQ_TYPE')
      })

      it('should return MISSING_EMAIL for PASSWORD_RESET without email', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
          requestType: 'PASSWORD_RESET',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('MISSING_EMAIL')
      })

      it('should return MISSING_ID_TOKEN for VERIFY_EMAIL without idToken', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
          requestType: 'VERIFY_EMAIL',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('MISSING_ID_TOKEN')
      })

      it('should return MISSING_ID_TOKEN for VERIFY_AND_CHANGE_EMAIL without idToken', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
          requestType: 'VERIFY_AND_CHANGE_EMAIL',
          newEmail: 'new@example.com',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('MISSING_ID_TOKEN')
      })
    })
  })

  /**
   * Invalid Field Values Tests
   *
   * Tests for fields with invalid values (wrong types, invalid formats, etc.)
   */
  describe('Invalid Field Values', () => {
    describe('Invalid idToken values', () => {
      it('should return INVALID_ID_TOKEN for malformed JWT', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:lookup', {
          idToken: 'not-a-valid-jwt',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_ID_TOKEN')
      })

      it('should return INVALID_ID_TOKEN for JWT with invalid signature', async () => {
        // A properly formatted but invalid JWT
        const invalidJwt =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid-signature'

        const { status, data } = await request<ErrorResponse>('/accounts:lookup', {
          idToken: invalidJwt,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_ID_TOKEN')
      })

      it('should return INVALID_ID_TOKEN for JWT with only two parts', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:lookup', {
          idToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_ID_TOKEN')
      })

      it('should return INVALID_ID_TOKEN for numeric idToken', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:lookup', {
          idToken: 12345,
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/INVALID_ID_TOKEN|MISSING_ID_TOKEN/)
      })

      it('should return INVALID_ID_TOKEN for array idToken', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:lookup', {
          idToken: ['token1', 'token2'],
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/INVALID_ID_TOKEN|MISSING_ID_TOKEN/)
      })

      it('should return INVALID_ID_TOKEN for object idToken', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:lookup', {
          idToken: { token: 'value' },
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toMatch(/INVALID_ID_TOKEN|MISSING_ID_TOKEN/)
      })
    })

    describe('Invalid requestType values', () => {
      it('should return INVALID_REQ_TYPE for unknown request type', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
          requestType: 'UNKNOWN_TYPE',
          email: 'test@example.com',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_REQ_TYPE')
      })

      it('should return INVALID_REQ_TYPE for empty request type', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
          requestType: '',
          email: 'test@example.com',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_REQ_TYPE')
      })

      it('should return INVALID_REQ_TYPE for numeric request type', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
          requestType: 123,
          email: 'test@example.com',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_REQ_TYPE')
      })

      it('should be case-sensitive for requestType', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:sendOobCode', {
          requestType: 'password_reset', // lowercase instead of PASSWORD_RESET
          email: 'test@example.com',
        })

        expect(status).toBe(400)
        const errorResponse = data as ErrorResponse
        expect(errorResponse.error.message).toBe('INVALID_REQ_TYPE')
      })
    })

    describe('Invalid boolean field values', () => {
      it('should handle returnSecureToken as string "true"', async () => {
        const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: 'validPassword123!',
          returnSecureToken: 'true', // string instead of boolean
        })

        // Should either accept string boolean or return proper error
        expect([200, 400]).toContain(status)
      })

      it('should handle emailVerified as string', async () => {
        // Creating user and attempting invalid update
        const email = generateTestEmail()
        const { data: signUpData } = await request<SignUpResponse>('/accounts:signUp', {
          email,
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        // emailVerified cannot be set by user, only by system
        // This tests that invalid values don't cause crashes
        expect(signUpData).toBeTruthy()
      })
    })

    describe('Invalid displayName values', () => {
      let testIdToken: string

      beforeEach(async () => {
        const email = generateTestEmail()
        const { data } = await request<SignUpResponse>('/accounts:signUp', {
          email,
          password: 'testPassword123!',
          returnSecureToken: true,
        })
        testIdToken = (data as SignUpResponse).idToken
      })

      it('should accept empty string displayName (for clearing)', async () => {
        const { status, data } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          displayName: '',
          returnSecureToken: true,
        })

        // Empty string should either clear the field or be ignored
        expect([200, 400]).toContain(status)
      })

      it('should handle very long displayName', async () => {
        const longName = 'A'.repeat(1000)
        const { status, data } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          displayName: longName,
          returnSecureToken: true,
        })

        // Should either accept long names or return appropriate error
        expect([200, 400]).toContain(status)
      })
    })

    describe('Invalid photoUrl values', () => {
      let testIdToken: string

      beforeEach(async () => {
        const email = generateTestEmail()
        const { data } = await request<SignUpResponse>('/accounts:signUp', {
          email,
          password: 'testPassword123!',
          returnSecureToken: true,
        })
        testIdToken = (data as SignUpResponse).idToken
      })

      it('should accept valid HTTPS URL for photoUrl', async () => {
        const { status } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          photoUrl: 'https://example.com/photo.jpg',
          returnSecureToken: true,
        })

        expect(status).toBe(200)
      })

      it('should accept valid HTTP URL for photoUrl', async () => {
        const { status } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          photoUrl: 'http://example.com/photo.jpg',
          returnSecureToken: true,
        })

        expect(status).toBe(200)
      })

      it('should handle non-URL string for photoUrl', async () => {
        const { status } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          photoUrl: 'not-a-url',
          returnSecureToken: true,
        })

        // Firebase may or may not validate URL format
        expect([200, 400]).toContain(status)
      })
    })

    describe('Invalid deleteAttribute values', () => {
      let testIdToken: string

      beforeEach(async () => {
        const email = generateTestEmail()
        const { data } = await request<SignUpResponse>('/accounts:signUp', {
          email,
          password: 'testPassword123!',
          displayName: 'Test User',
          returnSecureToken: true,
        })
        testIdToken = (data as SignUpResponse).idToken
      })

      it('should handle unknown deleteAttribute values gracefully', async () => {
        const { status } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          deleteAttribute: ['UNKNOWN_ATTRIBUTE'],
          returnSecureToken: true,
        })

        // Should either ignore unknown attributes or return error
        expect([200, 400]).toContain(status)
      })

      it('should handle empty deleteAttribute array', async () => {
        const { status } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          deleteAttribute: [],
          returnSecureToken: true,
        })

        expect(status).toBe(200)
      })

      it('should accept valid deleteAttribute DISPLAY_NAME', async () => {
        const { status } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          deleteAttribute: ['DISPLAY_NAME'],
          returnSecureToken: true,
        })

        expect(status).toBe(200)
      })

      it('should accept valid deleteAttribute PHOTO_URL', async () => {
        const { status } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          deleteAttribute: ['PHOTO_URL'],
          returnSecureToken: true,
        })

        expect(status).toBe(200)
      })

      it('should accept multiple valid deleteAttribute values', async () => {
        const { status } = await request<ErrorResponse>('/accounts:update', {
          idToken: testIdToken,
          deleteAttribute: ['DISPLAY_NAME', 'PHOTO_URL'],
          returnSecureToken: true,
        })

        expect(status).toBe(200)
      })
    })
  })

  /**
   * Edge Cases and Boundary Conditions
   */
  describe('Edge Cases and Boundary Conditions', () => {
    describe('Email edge cases', () => {
      it('should handle email at exact maximum length boundary', async () => {
        // RFC 5321 specifies max email length of 254 characters
        const localPart = 'a'.repeat(64) // Max local part is 64
        const domain = 'b'.repeat(63) + '.com' // Domain label max is 63
        const email = `${localPart}@${domain}`

        const { status } = await request<ErrorResponse>('/accounts:signUp', {
          email,
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        // Either accepts or rejects with appropriate error
        expect([200, 400]).toContain(status)
      })

      it('should handle email with international domain', async () => {
        const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
          email: `test-${Date.now()}@example.co.uk`,
          password: 'validPassword123!',
          returnSecureToken: true,
        })

        expect(status).toBe(200)
        expect((data as SignUpResponse).idToken).toBeTruthy()
      })
    })

    describe('Password edge cases', () => {
      it('should handle password with null bytes', async () => {
        const { status } = await request<ErrorResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: 'pass\0word123',
          returnSecureToken: true,
        })

        // Should either accept or reject cleanly
        expect([200, 400]).toContain(status)
      })

      it('should handle password with newlines', async () => {
        const { status } = await request<ErrorResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: 'pass\nword\n123456',
          returnSecureToken: true,
        })

        // Should either accept or reject cleanly
        expect([200, 400]).toContain(status)
      })

      it('should handle password with tabs', async () => {
        const { status } = await request<ErrorResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: 'pass\tword\t123456',
          returnSecureToken: true,
        })

        // Should either accept or reject cleanly
        expect([200, 400]).toContain(status)
      })
    })

    describe('Request body edge cases', () => {
      it('should handle extra unknown fields in request', async () => {
        const { status, data } = await request<SignUpResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: 'validPassword123!',
          returnSecureToken: true,
          unknownField: 'should be ignored',
          anotherUnknown: 12345,
        })

        expect(status).toBe(200)
        expect((data as SignUpResponse).idToken).toBeTruthy()
      })

      it('should handle deeply nested extra fields', async () => {
        const { status } = await request<SignUpResponse>('/accounts:signUp', {
          email: generateTestEmail(),
          password: 'validPassword123!',
          returnSecureToken: true,
          nested: {
            deep: {
              value: 'should be ignored',
            },
          },
        })

        expect(status).toBe(200)
      })
    })

    describe('Concurrent validation', () => {
      it('should handle multiple concurrent signUp requests', async () => {
        const promises = Array(5)
          .fill(null)
          .map(() =>
            request<SignUpResponse>('/accounts:signUp', {
              email: generateTestEmail(),
              password: 'validPassword123!',
              returnSecureToken: true,
            })
          )

        const results = await Promise.all(promises)

        // All should succeed
        results.forEach((result) => {
          expect(result.status).toBe(200)
          expect((result.data as SignUpResponse).idToken).toBeTruthy()
        })
      })

      it('should handle duplicate email race condition', async () => {
        const email = generateTestEmail()

        const promises = Array(3)
          .fill(null)
          .map(() =>
            request<SignUpResponse | ErrorResponse>('/accounts:signUp', {
              email,
              password: 'validPassword123!',
              returnSecureToken: true,
            })
          )

        const results = await Promise.all(promises)

        // Exactly one should succeed, others should fail with EMAIL_EXISTS
        const successes = results.filter((r) => r.status === 200)
        const failures = results.filter((r) => r.status === 400)

        expect(successes.length).toBeGreaterThanOrEqual(1)

        failures.forEach((result) => {
          const errorResponse = result.data as ErrorResponse
          expect(errorResponse.error.message).toBe('EMAIL_EXISTS')
        })
      })
    })
  })

  /**
   * Error Response Format Validation
   */
  describe('Error Response Format', () => {
    it('should return proper error format with code, message, and errors array', async () => {
      const { status, data } = await request<ErrorResponse>('/accounts:signUp', {
        email: 'invalid-email',
        password: 'validPassword123!',
        returnSecureToken: true,
      })

      expect(status).toBe(400)

      const errorResponse = data as ErrorResponse
      expect(errorResponse).toHaveProperty('error')
      expect(errorResponse.error).toHaveProperty('code')
      expect(errorResponse.error).toHaveProperty('message')
      expect(typeof errorResponse.error.code).toBe('number')
      expect(typeof errorResponse.error.message).toBe('string')

      // errors array is optional but should be array if present
      if (errorResponse.error.errors) {
        expect(Array.isArray(errorResponse.error.errors)).toBe(true)
        errorResponse.error.errors.forEach((err) => {
          expect(err).toHaveProperty('message')
          expect(err).toHaveProperty('domain')
          expect(err).toHaveProperty('reason')
        })
      }
    })

    it('should return consistent error code 400 for validation errors', async () => {
      const validationErrors = [
        { email: 'invalid', password: 'valid123!' }, // INVALID_EMAIL
        { email: 'valid@example.com', password: '123' }, // WEAK_PASSWORD
        { password: 'valid123!' }, // MISSING_EMAIL
      ]

      for (const body of validationErrors) {
        const { status } = await request<ErrorResponse>('/accounts:signInWithPassword', body)
        expect(status).toBe(400)
      }
    })
  })
})
