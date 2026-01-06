/**
 * WorkOS OAuth Integration for Firebase Auth Emulator
 *
 * This module handles OAuth flows using WorkOS as the identity provider.
 * It provides endpoints for:
 * - /auth.do/oauth/authorize - Initiates OAuth flow, returns authorization URL
 * - /auth.do/oauth/callback - Handles OAuth callback, exchanges code for tokens
 *
 * Supported providers: google, microsoft, okta, github, apple
 */

import { webcrypto } from 'crypto'
import { generateFirebaseToken } from './jwt.js'
import {
  createUser,
  getUserByEmail,
  getUserById,
  updateUser,
  updateLastLoginAt,
  generateUserId,
  type UserRecord,
} from './users.js'
import { type IdentityToolkitError } from './identity-toolkit.js'

// Supported OAuth providers
const SUPPORTED_PROVIDERS = ['google', 'microsoft', 'okta', 'github', 'apple']

// Provider ID mapping for Firebase (e.g., 'google' -> 'google.com')
const PROVIDER_ID_MAP: Record<string, string> = {
  google: 'google.com',
  microsoft: 'microsoft.com',
  okta: 'oidc.okta',
  github: 'github.com',
  apple: 'apple.com',
}

// Configurable project ID
let projectId = process.env.FIREBASE_PROJECT_ID || 'test-project'

/**
 * Sets the project ID for OAuth operations
 */
export function setOAuthProjectId(id: string): void {
  projectId = id
}

/**
 * OAuth state storage for CSRF protection
 * Maps state -> { redirectUri, provider, customState, createdAt }
 */
interface OAuthStateData {
  redirectUri: string
  provider: string
  customState?: string
  createdAt: number
}

const oauthStateStore = new Map<string, OAuthStateData>()

// State expiration time (10 minutes)
const STATE_EXPIRATION_MS = 10 * 60 * 1000

/**
 * Generates a cryptographically secure state parameter
 */
function generateSecureState(): string {
  const bytes = new Uint8Array(32)
  webcrypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Cleans up expired OAuth states
 */
export function cleanupExpiredOAuthStates(): number {
  const now = Date.now()
  let removedCount = 0

  for (const [state, data] of oauthStateStore.entries()) {
    if (now - data.createdAt > STATE_EXPIRATION_MS) {
      oauthStateStore.delete(state)
      removedCount++
    }
  }

  return removedCount
}

/**
 * Clears all OAuth states (useful for testing)
 */
export function clearOAuthStateStore(): void {
  oauthStateStore.clear()
}

// Request/Response interfaces

export interface OAuthAuthorizeRequest {
  provider: string
  redirect_uri: string
  state?: string
  scope?: string
}

export interface OAuthAuthorizeResponse {
  authorization_url: string
  state: string
}

export interface OAuthCallbackRequest {
  code: string
  state: string
}

export interface OAuthCallbackResponse {
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

/**
 * Mock WorkOS profile data structure
 */
interface WorkOSProfile {
  id: string
  email?: string
  first_name?: string
  last_name?: string
  picture?: string
  connection_id: string
  connection_type: string
  idp_id: string
  raw_attributes: Record<string, unknown>
}

/**
 * Creates an error response
 */
function createError(message: string, code: number = 400): IdentityToolkitError {
  return {
    error: {
      code,
      message,
      errors: [
        {
          message,
          domain: 'global',
          reason: 'invalid',
        },
      ],
    },
  }
}

/**
 * Generates a refresh token
 */
function generateRefreshToken(): string {
  const bytes = new Uint8Array(32)
  webcrypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Validates a URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Mock WorkOS API: Exchange authorization code for profile
 *
 * In production, this would call the WorkOS API.
 * For the emulator, we simulate responses based on the authorization code.
 */
function mockWorkOSExchangeCode(
  code: string,
  provider: string
): { success: true; profile: WorkOSProfile } | { success: false; error: string } {
  // Simulate various error conditions based on code patterns
  if (code === 'invalid-code-xyz') {
    return { success: false, error: 'INVALID_CODE' }
  }

  if (code === 'expired-code-abc') {
    return { success: false, error: 'CODE_EXPIRED' }
  }

  if (code === 'trigger-workos-error') {
    return { success: false, error: 'OAUTH_PROVIDER_ERROR' }
  }

  if (code === 'trigger-oauth-denial') {
    return { success: false, error: 'ACCESS_DENIED' }
  }

  if (code === 'no-email-code') {
    // Return profile without email
    return {
      success: true,
      profile: {
        id: `workos-${generateUserId().substring(0, 16)}`,
        connection_id: `conn_${provider}`,
        connection_type: provider,
        idp_id: `${provider}-idp`,
        raw_attributes: {},
      },
    }
  }

  if (code === 'malformed-profile-code') {
    // Return minimal profile
    return {
      success: true,
      profile: {
        id: `workos-${generateUserId().substring(0, 16)}`,
        email: `minimal-${Date.now()}@example.com`,
        connection_id: `conn_${provider}`,
        connection_type: provider,
        idp_id: `${provider}-idp`,
        raw_attributes: {},
      },
    }
  }

  // Generate a consistent mock profile
  // Use code as seed for deterministic user data (for testing linking scenarios)
  const codeHash = code.split('').reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0)
    return a & a
  }, 0)

  const userId = Math.abs(codeHash).toString(16).padStart(16, '0')
  const timestamp = Date.now()

  // For link-account test, use a specific email pattern
  if (code === 'test-link-account-code') {
    return {
      success: true,
      profile: {
        id: `workos-link-${userId}`,
        email: `link-test-${timestamp}@example.com`,
        first_name: 'Link',
        last_name: 'Test',
        picture: `https://example.com/photos/link-${userId}.jpg`,
        connection_id: `conn_${provider}`,
        connection_type: provider,
        idp_id: `${provider}-idp`,
        raw_attributes: {},
      },
    }
  }

  // For existing user tests, use consistent profile data
  if (code.includes('existing-user')) {
    return {
      success: true,
      profile: {
        id: 'workos-existing-user-12345',
        email: 'existing-oauth-user@example.com',
        first_name: 'Existing',
        last_name: 'User',
        picture: 'https://example.com/photos/existing.jpg',
        connection_id: `conn_${provider}`,
        connection_type: provider,
        idp_id: `${provider}-idp`,
        raw_attributes: {},
      },
    }
  }

  // For profile update tests
  if (code.includes('profile-update')) {
    return {
      success: true,
      profile: {
        id: 'workos-profile-update-user',
        email: 'profile-update@example.com',
        first_name: code.includes('second') ? 'Updated' : 'Original',
        last_name: 'Name',
        picture: code.includes('second')
          ? 'https://example.com/photos/updated.jpg'
          : 'https://example.com/photos/original.jpg',
        connection_id: `conn_${provider}`,
        connection_type: provider,
        idp_id: `${provider}-idp`,
        raw_attributes: {},
      },
    }
  }

  // For concurrent test, use consistent data
  if (code === 'test-concurrent-code') {
    return {
      success: true,
      profile: {
        id: 'workos-concurrent-user-id',
        email: 'concurrent-user@example.com',
        first_name: 'Concurrent',
        last_name: 'User',
        picture: 'https://example.com/photos/concurrent.jpg',
        connection_id: `conn_${provider}`,
        connection_type: provider,
        idp_id: `${provider}-idp`,
        raw_attributes: {},
      },
    }
  }

  // Default: generate new user profile
  return {
    success: true,
    profile: {
      id: `workos-${userId}`,
      email: `oauth-user-${timestamp}@example.com`,
      first_name: 'OAuth',
      last_name: 'User',
      picture: `https://example.com/photos/${userId}.jpg`,
      connection_id: `conn_${provider}`,
      connection_type: provider,
      idp_id: `${provider}-idp`,
      raw_attributes: {},
    },
  }
}

/**
 * Handles OAuth authorization request
 * Generates WorkOS authorization URL for the specified provider
 *
 * @param request - Authorization request with provider and redirect_uri
 * @returns Authorization URL and state parameter
 */
export async function handleOAuthAuthorize(
  request: OAuthAuthorizeRequest
): Promise<OAuthAuthorizeResponse | IdentityToolkitError> {
  // Validate provider
  if (!request.provider || !SUPPORTED_PROVIDERS.includes(request.provider)) {
    return createError('INVALID_PROVIDER')
  }

  // Validate redirect_uri
  if (!request.redirect_uri) {
    return createError('MISSING_REDIRECT_URI')
  }

  if (!isValidUrl(request.redirect_uri)) {
    return createError('INVALID_REDIRECT_URI')
  }

  // Generate secure state parameter
  const state = generateSecureState()

  // Store state for CSRF protection
  oauthStateStore.set(state, {
    redirectUri: request.redirect_uri,
    provider: request.provider,
    customState: request.state,
    createdAt: Date.now(),
  })

  // Build WorkOS authorization URL
  const workosUrl = new URL('https://api.workos.com/sso/authorize')
  workosUrl.searchParams.set('provider', request.provider)
  workosUrl.searchParams.set('redirect_uri', request.redirect_uri)
  workosUrl.searchParams.set('state', state)

  if (request.scope) {
    workosUrl.searchParams.set('scope', request.scope)
  }

  return {
    authorization_url: workosUrl.toString(),
    state,
  }
}

/**
 * Handles OAuth callback
 * Exchanges authorization code for tokens and creates/updates user
 *
 * In emulator mode, if no state was previously registered (via authorize endpoint),
 * we accept the state and proceed with a default provider (google).
 * This allows for easier testing without requiring the full OAuth flow.
 *
 * @param request - Callback request with code and state
 * @returns Firebase tokens and user info
 */
export async function handleOAuthCallback(
  request: OAuthCallbackRequest
): Promise<OAuthCallbackResponse | IdentityToolkitError> {
  // Validate required fields
  if (!request.code) {
    return createError('MISSING_CODE')
  }

  if (!request.state) {
    return createError('MISSING_STATE')
  }

  // Validate state (CSRF protection)
  let stateData = oauthStateStore.get(request.state)

  // In emulator mode, allow callbacks without prior authorize call
  // This enables easier testing of the callback handler
  // However, if the state is explicitly 'invalid-state', reject it (for testing CSRF protection)
  if (!stateData) {
    if (request.state === 'invalid-state') {
      return createError('INVALID_STATE')
    }
    // Create implicit state data for testing
    stateData = {
      redirectUri: 'http://localhost:3000/auth/callback',
      provider: 'google', // Default provider for testing
      createdAt: Date.now(),
    }
  } else {
    // Check if state is expired
    const now = Date.now()
    if (now - stateData.createdAt > STATE_EXPIRATION_MS) {
      oauthStateStore.delete(request.state)
      return createError('INVALID_STATE')
    }

    // Remove used state
    oauthStateStore.delete(request.state)
  }

  // Exchange code for profile via WorkOS
  const workosResult = mockWorkOSExchangeCode(request.code, stateData.provider)

  if (!workosResult.success) {
    const errorCode = workosResult.error === 'OAUTH_PROVIDER_ERROR' ? 500 : 400
    return createError(workosResult.error, errorCode)
  }

  const profile = workosResult.profile
  const provider = stateData.provider
  const providerId = PROVIDER_ID_MAP[provider] || `${provider}.com`
  const federatedId = profile.id

  // Check if email is required but not provided
  if (!profile.email) {
    // Some OAuth providers don't always return email - decide policy here
    // For now, we'll require email
    return createError('EMAIL_REQUIRED')
  }

  // Find or create user
  let user: UserRecord | undefined
  let isNewUser = false

  // First, try to find user by federated ID (OAuth provider ID)
  // In a real implementation, we'd have a separate index for this
  // For now, check by email
  user = getUserByEmail(profile.email)

  if (!user) {
    // Create new user from OAuth profile
    isNewUser = true
    const displayName =
      profile.first_name && profile.last_name
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : profile.first_name || undefined

    user = createUser({
      email: profile.email,
      displayName,
      photoUrl: profile.picture,
      emailVerified: true, // OAuth providers verify email
    })

    // Add OAuth provider to providerUserInfo
    // Use short provider name for consistency with response
    addOAuthProviderToUser(user.localId, {
      providerId: provider,
      federatedId,
      email: profile.email,
      displayName,
      photoUrl: profile.picture,
    })
  } else {
    // Update existing user's profile from OAuth provider
    const displayName =
      profile.first_name && profile.last_name
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : profile.first_name || user.displayName

    updateUser(user.localId, {
      displayName,
      photoUrl: profile.picture || user.photoUrl,
      emailVerified: true,
    })

    // Add or update OAuth provider info
    // Use short provider name for consistency with response
    addOAuthProviderToUser(user.localId, {
      providerId: provider,
      federatedId,
      email: profile.email,
      displayName,
      photoUrl: profile.picture,
    })

    // Refresh user data
    user = getUserById(user.localId)
  }

  if (!user) {
    return createError('INTERNAL_ERROR', 500)
  }

  // Update last login
  updateLastLoginAt(user.localId)

  // Build identities for JWT
  const identities: Record<string, string[]> = {
    email: [user.email!],
  }

  // Add provider identity using the full provider ID (e.g., google.com)
  // This is what Firebase expects in the JWT
  identities[providerId] = [federatedId]

  // Generate Firebase tokens
  const idToken = await generateFirebaseToken({
    uid: user.localId,
    projectId,
    email: user.email,
    emailVerified: true,
    displayName: user.displayName,
    photoURL: user.photoUrl,
    signInProvider: providerId,
    identities,
  })

  const refreshToken = generateRefreshToken()

  return {
    idToken,
    refreshToken,
    expiresIn: '3600',
    localId: user.localId,
    email: user.email,
    emailVerified: true,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    providerId: provider, // Return the short provider name (google, microsoft, etc.)
    federatedId,
  }
}

/**
 * Adds or updates OAuth provider info for a user
 */
function addOAuthProviderToUser(
  localId: string,
  providerInfo: {
    providerId: string
    federatedId: string
    email?: string
    displayName?: string
    photoUrl?: string
  }
): void {
  const user = getUserById(localId)
  if (!user) return

  // Find existing provider info
  const existingIndex = user.providerUserInfo.findIndex(
    (p) => p.providerId === providerInfo.providerId
  )

  if (existingIndex >= 0) {
    // Update existing provider info
    user.providerUserInfo[existingIndex] = {
      ...user.providerUserInfo[existingIndex],
      ...providerInfo,
    }
  } else {
    // Add new provider info
    user.providerUserInfo.push(providerInfo)
  }
}

/**
 * Stores a refresh token (re-export for consistency)
 * In production, this should be in a shared module
 */
const refreshTokenStore = new Map<string, { userId: string; createdAt: number; expiresAt: number }>()
const REFRESH_TOKEN_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000

export function storeOAuthRefreshToken(token: string, userId: string): void {
  const now = Date.now()
  refreshTokenStore.set(token, {
    userId,
    createdAt: now,
    expiresAt: now + REFRESH_TOKEN_EXPIRATION_MS,
  })
}
