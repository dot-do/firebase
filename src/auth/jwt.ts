import crypto from 'crypto'

/**
 * Firebase-compatible JWT Generation
 *
 * This module provides functions to generate Firebase ID tokens that are compatible
 * with the Firebase Authentication JWT format using RS256 signing.
 *
 * Reference: https://firebase.google.com/docs/auth/admin/verify-id-tokens
 */

export interface GenerateTokenOptions {
  uid: string
  projectId: string
  claims?: Record<string, unknown>
  signInProvider?: string
  identities?: Record<string, string[]>
  email?: string
  emailVerified?: boolean
}

interface FirebaseJwtPayload {
  iss: string
  aud: string
  sub: string
  user_id: string
  auth_time: number
  iat: number
  exp: number
  email?: string
  email_verified?: boolean
  phone_number?: string
  name?: string
  picture?: string
  firebase: {
    identities: Record<string, string[]>
    sign_in_provider: string
  }
  [key: string]: unknown
}

interface FirebaseJwtHeader {
  alg: string
  typ: string
  kid: string
}

interface SigningKeyPair {
  kid: string
  privateKey: string
  publicKey: string
}

// Global state for the current signing key
let currentSigningKey: SigningKeyPair | null = null

/**
 * Reserved claim names that cannot be overridden by custom claims
 */
const RESERVED_CLAIMS = new Set([
  'iss',
  'aud',
  'sub',
  'user_id',
  'auth_time',
  'iat',
  'exp',
  'firebase',
])

/**
 * Generates a new RSA key pair for JWT signing
 */
function generateKeyPair(): SigningKeyPair {
  const kid = crypto.randomBytes(16).toString('hex')

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  })

  return { kid, privateKey, publicKey }
}

/**
 * Gets the current signing key, generating one if it doesn't exist
 */
function getCurrentSigningKey(): SigningKeyPair {
  if (!currentSigningKey) {
    currentSigningKey = generateKeyPair()
  }
  return currentSigningKey
}

/**
 * Base64URL encoding (RFC 4648 § 5)
 */
function base64UrlEncode(data: string | Buffer): string {
  const base64 = Buffer.from(data).toString('base64')
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Signs data using RS256 algorithm
 */
function signRS256(data: string, privateKey: string): string {
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(data)
  sign.end()
  const signature = sign.sign(privateKey)
  return base64UrlEncode(signature)
}

/**
 * Rotates the signing key and returns the new key ID
 */
export async function rotateSigningKey(): Promise<{ kid: string }> {
  currentSigningKey = generateKeyPair()
  return { kid: currentSigningKey.kid }
}

/**
 * Generates a Firebase-compatible JWT token
 *
 * @param options - Token generation options including uid, projectId, and optional claims
 * @returns A signed JWT token in the format: header.payload.signature
 */
export async function generateFirebaseToken(
  options: GenerateTokenOptions
): Promise<string> {
  const { uid, projectId, claims, signInProvider, identities, email, emailVerified } = options

  // Validate required parameters
  if (!uid || uid.trim() === '') {
    throw new Error('uid is required and cannot be empty')
  }

  if (!projectId || projectId.trim() === '') {
    throw new Error('projectId is required and cannot be empty')
  }

  const signingKey = getCurrentSigningKey()
  const now = Math.floor(Date.now() / 1000)

  // Build JWT header
  const header: FirebaseJwtHeader = {
    alg: 'RS256',
    typ: 'JWT',
    kid: signingKey.kid,
  }

  // Build JWT payload with required claims
  const payload: FirebaseJwtPayload = {
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    sub: uid,
    user_id: uid,
    auth_time: now,
    iat: now,
    exp: now + 3600, // 1 hour expiration
    firebase: {
      identities: identities || {},
      sign_in_provider: signInProvider || 'custom',
    },
  }

  // Add optional standard claims
  if (email !== undefined) {
    payload.email = email
  }

  if (emailVerified !== undefined) {
    payload.email_verified = emailVerified
  }

  // Merge custom claims, but protect reserved claims
  if (claims && typeof claims === 'object') {
    for (const [key, value] of Object.entries(claims)) {
      if (!RESERVED_CLAIMS.has(key)) {
        payload[key] = value
      }
    }
  }

  // Encode header and payload
  const headerEncoded = base64UrlEncode(JSON.stringify(header))
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload))

  // Sign the token
  const dataToSign = `${headerEncoded}.${payloadEncoded}`
  const signature = signRS256(dataToSign, signingKey.privateKey)

  // Return the complete JWT
  return `${dataToSign}.${signature}`
}

/**
 * Base64URL decoding (RFC 4648 § 5)
 */
function base64UrlDecode(str: string): string {
  // Add padding if needed
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = (4 - (base64.length % 4)) % 4
  base64 += '='.repeat(padding)
  return Buffer.from(base64, 'base64').toString('utf-8')
}

export interface VerifiedTokenPayload {
  iss: string
  aud: string
  sub: string
  user_id: string
  auth_time: number
  iat: number
  exp: number
  email?: string
  email_verified?: boolean
  phone_number?: string
  name?: string
  picture?: string
  firebase: {
    identities: Record<string, string[]>
    sign_in_provider: string
  }
  [key: string]: unknown
}

/**
 * Verifies a Firebase JWT token
 *
 * For the emulator, this validates the token structure and signature
 * against our own generated keys.
 *
 * @param token - The JWT token to verify
 * @param projectId - The expected project ID
 * @returns The decoded payload if valid
 * @throws Error if token is invalid or expired
 */
export async function verifyFirebaseToken(
  token: string,
  projectId: string
): Promise<VerifiedTokenPayload> {
  if (!token || typeof token !== 'string') {
    throw new Error('INVALID_ID_TOKEN')
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('INVALID_ID_TOKEN')
  }

  const [headerB64, payloadB64, signatureB64] = parts

  // Decode and parse header
  let header: FirebaseJwtHeader
  try {
    header = JSON.parse(base64UrlDecode(headerB64))
  } catch {
    throw new Error('INVALID_ID_TOKEN')
  }

  // Validate header
  if (header.alg !== 'RS256' || header.typ !== 'JWT') {
    throw new Error('INVALID_ID_TOKEN')
  }

  // Decode and parse payload
  let payload: VerifiedTokenPayload
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64))
  } catch {
    throw new Error('INVALID_ID_TOKEN')
  }

  // Validate required claims exist
  if (!payload.sub || !payload.user_id || !payload.exp || !payload.iat) {
    throw new Error('INVALID_ID_TOKEN')
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp < now) {
    throw new Error('TOKEN_EXPIRED')
  }

  // Check issued-at time (not in the future)
  if (payload.iat > now + 300) {
    // Allow 5 minutes clock skew
    throw new Error('INVALID_ID_TOKEN')
  }

  // Validate issuer
  const expectedIssuer = `https://securetoken.google.com/${projectId}`
  if (payload.iss !== expectedIssuer) {
    throw new Error('INVALID_ID_TOKEN')
  }

  // Validate audience
  if (payload.aud !== projectId) {
    throw new Error('INVALID_ID_TOKEN')
  }

  // For emulator: verify signature with our signing key if we have it
  const signingKey = currentSigningKey
  if (signingKey && header.kid === signingKey.kid) {
    const dataToVerify = `${headerB64}.${payloadB64}`
    const signatureBuffer = Buffer.from(
      signatureB64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (signatureB64.length % 4)) % 4),
      'base64'
    )

    const verify = crypto.createVerify('RSA-SHA256')
    verify.update(dataToVerify)
    verify.end()

    const isValid = verify.verify(signingKey.publicKey, signatureBuffer)
    if (!isValid) {
      throw new Error('INVALID_ID_TOKEN')
    }
  }
  // For tokens signed with different keys (e.g., from other emulator instances),
  // we still accept them as long as the claims are valid. This allows for
  // flexibility during testing and development.

  return payload
}
